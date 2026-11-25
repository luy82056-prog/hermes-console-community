import path from "node:path";

type PermissionOption = {
  optionId?: unknown;
};

type PermissionParams = {
  options?: unknown;
  toolCall?: unknown;
};

export type PermissionDialogOptions = {
  title: string; message: string; detail: string; buttons: string[];
  defaultId: number; cancelId: number; noLink: boolean;
  autoAllowResponse: number | null; allowResponses: number[];
};

function permissionOptions(params: unknown) {
  const request = asRecord(params);
  return (Array.isArray(request?.options) ? request.options : [])
    .map(asRecord).filter((option): option is Record<string, unknown> =>
      !!option && typeof option.optionId === "string" && option.optionId.length > 0);
}

function isAllowOption(option: Record<string, unknown>) {
  if (typeof option.kind === "string") return ["allow_once", "allow_always"].includes(option.kind);
  return ["allow_once", "allow_session", "allow_always"].includes(String(option.optionId));
}

export function automaticPermissionOption(params: unknown): string | null {
  const options = permissionOptions(params).filter(isAllowOption);
  const selected = options.find((option) => option.kind === "allow_once" || option.optionId === "allow_once") ?? options[0];
  return selected ? String(selected.optionId) : null;
}

export async function requestUserPermission(
  params: unknown,
  show: (options: PermissionDialogOptions) => Promise<{ response: number }>
): Promise<{ outcome: { outcome: "cancelled" } | { outcome: "selected"; optionId: string } }> {
  const cancelled = { outcome: { outcome: "cancelled" as const } };
  const request = asRecord(params);
  const options = permissionOptions(params);
  if (!options.length) return cancelled;
  const labels: Record<string, string> = {
    allow_once: "允许一次", allow_session: "允许本会话", allow_always: "始终允许",
    deny: "拒绝", deny_always: "始终拒绝"
  };
  const tool = asRecord(request?.toolCall);
  const detail = [permissionCommand(params), JSON.stringify(tool?.rawInput ?? tool ?? {}, null, 2)]
    .filter(Boolean).join("\n\n");
  try {
    const result = await show({
      title: "Hermes Console · 权限申请",
      message: typeof tool?.title === "string" ? tool.title : "Hermes 请求执行以下操作",
      detail,
      buttons: ["取消", ...options.map((option) => labels[String(option.optionId)] ?? String(option.name ?? option.optionId))],
      defaultId: 0, cancelId: 0, noLink: true,
      autoAllowResponse: automaticPermissionOption(params) === null ? null : options.findIndex((option) => option.optionId === automaticPermissionOption(params)) + 1,
      allowResponses: options.flatMap((option, index) => isAllowOption(option) ? [index + 1] : [])
    });
    const selected = options[result.response - 1];
    return selected ? { outcome: { outcome: "selected", optionId: String(selected.optionId) } } : cancelled;
  } catch {
    return cancelled;
  }
}

const SHELL_CONTROL_PATTERN = /(?:[;&|`<>\r\n]|\$\()/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

export function permissionCommand(params: unknown): string {
  const request = asRecord(params) as PermissionParams | null;
  const toolCall = asRecord(request?.toolCall);
  const rawInput = asRecord(toolCall?.rawInput);
  return typeof rawInput?.command === "string" ? rawInput.command.trim() : "";
}

function commandInvokesExecutable(command: string, executable: string) {
  const normalizedExecutable = path.resolve(executable);
  const prefixes = [
    normalizedExecutable,
    `'${normalizedExecutable}'`,
    `"${normalizedExecutable}"`
  ];

  return prefixes.some((prefix) => command === prefix || command.startsWith(`${prefix} `));
}

function supportedPermissionOption(params: unknown) {
  const request = asRecord(params) as PermissionParams | null;
  const options = Array.isArray(request?.options) ? request.options : [];
  const optionIds = options
    .map((option) => asRecord(option) as PermissionOption | null)
    .map((option) => typeof option?.optionId === "string" ? option.optionId : "");

  return ["allow_once", "allow_session", "allow_always"].find((id) => optionIds.includes(id)) ?? null;
}

export function trustedNotionPermissionOption(params: unknown, executable: string): string | null {
  const command = permissionCommand(params);
  if (!command || SHELL_CONTROL_PATTERN.test(command) || !commandInvokesExecutable(command, executable)) {
    return null;
  }

  // Approve each constrained wrapper call without creating a broad terminal allowlist.
  return supportedPermissionOption(params);
}

export function trustedNotionPayloadPermissionOption(params: unknown, payloadDirectory: string): string | null {
  const request = asRecord(params) as PermissionParams | null;
  const toolCall = asRecord(request?.toolCall);
  const rawInput = asRecord(toolCall?.rawInput);
  const tool = typeof rawInput?.tool === "string" ? rawInput.tool : "";
  const argumentsRecord = asRecord(rawInput?.arguments);
  const target = typeof argumentsRecord?.path === "string" ? argumentsRecord.path : "";

  if (!(["write_file", "patch"].includes(tool)) || !target) {
    return null;
  }

  const root = path.resolve(payloadDirectory);
  const resolvedTarget = path.resolve(target.replace(/^~(?=\/)/, process.env.HOME ?? ""));
  if (resolvedTarget !== root && !resolvedTarget.startsWith(`${root}${path.sep}`)) {
    return null;
  }

  return supportedPermissionOption(params);
}
