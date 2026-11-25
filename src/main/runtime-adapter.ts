import { randomUUID } from "node:crypto";

export type RuntimeCapabilities = {
  streaming: boolean;
  sessions: boolean;
  interrupt: boolean;
  tools: boolean;
  localFiles: boolean;
};

export type AgentDescriptor = {
  runtimeId: string;
  agentId: string;
  name: string;
  model: string;
  status: "idle" | "running" | "paused" | "offline";
};

export type StartSessionInput = {
  agentId: string;
  modelPresetId?: string;
};

export type SessionDescriptor = {
  runtimeId: string;
  agentId: string;
  sessionId: string;
  createdAt: string;
};

export type RuntimeEvent = {
  runtimeId: string;
  type: string;
  agentId?: string;
  sessionId?: string;
  [key: string]: unknown;
};

export type RuntimeEventListener = (event: RuntimeEvent) => void;

export type AgentRuntimeAdapter = {
  id: string;
  label: string;
  capabilities: RuntimeCapabilities;
  connect(): Promise<void>;
  listAgents(): Promise<AgentDescriptor[]>;
  startSession(input: StartSessionInput): Promise<SessionDescriptor>;
  send(sessionId: string, prompt: string): Promise<unknown>;
  interrupt(sessionId: string): Promise<unknown>;
  subscribe(listener: RuntimeEventListener): () => void;
};

type HermesAdapterDelegates = {
  listAgents: () => Promise<AgentDescriptor[]> | AgentDescriptor[];
  resetAgent: (agentId: string, modelPresetId?: string) => Promise<unknown> | unknown;
  sendAgent: (agentId: string, prompt: string, modelPresetId?: string) => Promise<unknown>;
  interruptAgent: (agentId: string) => Promise<unknown> | unknown;
};

export class HermesRuntimeAdapter implements AgentRuntimeAdapter {
  readonly id = "hermes";
  readonly label = "Hermes ACP";
  readonly capabilities: RuntimeCapabilities = {
    streaming: true,
    sessions: true,
    interrupt: true,
    tools: true,
    localFiles: true
  };
  private readonly sessions = new Map<string, StartSessionInput>();
  private readonly listeners = new Set<RuntimeEventListener>();

  constructor(private readonly delegates: HermesAdapterDelegates) {}

  async connect() {
    await this.delegates.listAgents();
  }

  async listAgents() {
    return this.delegates.listAgents();
  }

  async startSession(input: StartSessionInput) {
    await this.delegates.resetAgent(input.agentId, input.modelPresetId);
    const sessionId = `${input.agentId}:${randomUUID()}`;
    this.sessions.set(sessionId, input);
    return { runtimeId: this.id, agentId: input.agentId, sessionId, createdAt: new Date().toISOString() };
  }

  async send(sessionId: string, prompt: string) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("Runtime session 不存在或已经关闭。");
    return this.delegates.sendAgent(session.agentId, prompt, session.modelPresetId);
  }

  async interrupt(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("Runtime session 不存在或已经关闭。");
    return this.delegates.interruptAgent(session.agentId);
  }

  subscribe(listener: RuntimeEventListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(event: Omit<RuntimeEvent, "runtimeId">) {
    const normalized = { ...event, runtimeId: this.id } as RuntimeEvent;
    for (const listener of this.listeners) listener(normalized);
  }
}

export class RuntimeRegistry {
  private readonly adapters = new Map<string, AgentRuntimeAdapter>();

  register<T extends AgentRuntimeAdapter>(adapter: T): T {
    if (this.adapters.has(adapter.id)) throw new Error(`Runtime ${adapter.id} 已经注册。`);
    this.adapters.set(adapter.id, adapter);
    return adapter;
  }

  get(runtimeId: string) {
    const adapter = this.adapters.get(runtimeId);
    if (!adapter) throw new Error(`找不到 Runtime: ${runtimeId}`);
    return adapter;
  }

  list() {
    return [...this.adapters.values()].map((adapter) => ({
      id: adapter.id,
      label: adapter.label,
      capabilities: adapter.capabilities
    }));
  }

  async connectAll() {
    await Promise.all([...this.adapters.values()].map((adapter) => adapter.connect()));
  }
}

export type GatewayRuntimeClient = {
  connect(): Promise<void>;
  listAgents(): Promise<Omit<AgentDescriptor, "runtimeId">[]>;
  startSession(input: StartSessionInput): Promise<Omit<SessionDescriptor, "runtimeId">>;
  send(sessionId: string, prompt: string): Promise<unknown>;
  interrupt(sessionId: string): Promise<unknown>;
  subscribe(listener: (event: Omit<RuntimeEvent, "runtimeId">) => void): () => void;
};

// OpenClaw can plug in through its Gateway WebSocket without leaking protocol details into the UI.
export class OpenClawRuntimeAdapter implements AgentRuntimeAdapter {
  readonly id = "openclaw";
  readonly label = "OpenClaw Gateway";
  readonly capabilities: RuntimeCapabilities = {
    streaming: true,
    sessions: true,
    interrupt: true,
    tools: true,
    localFiles: false
  };

  constructor(private readonly client: GatewayRuntimeClient) {}

  connect() {
    return this.client.connect();
  }

  async listAgents() {
    return (await this.client.listAgents()).map((agent) => ({ ...agent, runtimeId: this.id }));
  }

  async startSession(input: StartSessionInput) {
    return { ...(await this.client.startSession(input)), runtimeId: this.id };
  }

  send(sessionId: string, prompt: string) {
    return this.client.send(sessionId, prompt);
  }

  interrupt(sessionId: string) {
    return this.client.interrupt(sessionId);
  }

  subscribe(listener: RuntimeEventListener) {
    return this.client.subscribe((event) => listener({ ...event, runtimeId: this.id } as RuntimeEvent));
  }
}
