// Run with: node_modules/.bin/electron tests/model-config.electron.cjs
// Uses Electron encryption with a test keychain and real IPC handlers, isolated data, and a local API fixture.
const { app, ipcMain, safeStorage } = require('electron');
app.commandLine.appendSwitch('use-mock-keychain');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-model-config-'));
os.homedir = () => home;
process.env.HOME = home;
process.env.CODEX_HOME = path.join(home, '.codex');
process.env.HERMES_CONSOLE_CWD = home;
app.setPath('userData', path.join(home, 'electron-data'));
const handlers = new Map();
const register = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (name, handler) => { handlers.set(name, handler); register(name, handler); };
const invoke = (name, ...args) => handlers.get(name)({}, ...args);
// Register the production handlers without running unrelated startup jobs.
const ready = app.whenReady.bind(app);
app.whenReady = () => new Promise(() => {});
require(path.join(root, 'dist/main/main.js'));
app.whenReady = ready;

const put = (relative, value) => {
  const file = path.join(home, relative);
  fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, value); return file;
};
const read = relative => fs.readFileSync(path.join(home, relative), 'utf8');
put('.hermes/config.yaml', 'agent:\n  max_turns: 4\n');
put('.hermes-console/agents/parent/config.yaml', 'agent:\n  max_turns: 7\nterminal:\n  timeout: 91\n');
const database = put('.hermes-console/agents/parent/state.db', 'retained session database');
const databaseIdentity = fs.statSync(database).ino;
put('.hermes-console/agents/parent/logs/errors.log', 'sqlite3.IntegrityError: an old failure\nFailed to persist ACP session\n');
const preserved = [
  '.hermes-console/agents/parent/memories/USER.md',
  '.hermes-console/agents/parent/memories/MEMORY.md',
  '.hermes-console/agents/parent/sessions/session_existing.json',
  '.hermes-console/agents/parent/skills/custom/SKILL.md',
  '.hermes-console/heartprint/profile.json',
  'Documents/Hermes Knowledge/Knowledge/kept.md',
  '.hermes/profiles/consoleparent/memories/MEMORY.md'
];
preserved.forEach(file => put(file, 'retained-' + file));
let requests = 0;
const server = http.createServer((req, res) => {
  assert.equal(req.headers.authorization, 'Bearer synthetic-private-key');
  requests++;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({data:[{id:'model-one'}, {id:'model-two'}]}));
});

ready().then(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  const preset = {id:'draft',label:'Local fixture',model:'model-one',provider:'openai',providerLabel:'Fixture',baseUrl,apiKeyEnv:'OPENAI_API_KEY',custom:true};
  const models = await invoke('hermes:discoverModels', preset, 'synthetic-private-key');
  assert.deepEqual(models.models, ['model-one','model-two']);
  const configured = invoke('hermes:agent:configureModel','parent',preset,'synthetic-private-key');
  assert.equal(configured.ok,true);
  assert.equal(safeStorage.isEncryptionAvailable(),true);
  const encrypted = JSON.parse(read('.hermes-console/model-keys.json'));
  assert.ok(!JSON.stringify(encrypted).includes('synthetic-private-key'));
  assert.equal(safeStorage.decryptString(Buffer.from(Object.values(encrypted)[0],'base64')),'synthetic-private-key');
  assert.match(read('.hermes-console/agents/parent/.env'),/OPENAI_API_KEY="synthetic-private-key"/);
  assert.match(read('.hermes/profiles/consoleparent/.env'),/OPENAI_API_KEY="synthetic-private-key"/);
  const second = {...preset,model:'model-two'};
  assert.equal(invoke('hermes:agent:configureModel','parent',second).ok,true,'same endpoint reuses saved key');
  assert.equal((await invoke('hermes:discoverModels',second)).ok,true);
  const other = {...preset,baseUrl:baseUrl.replace('/v1','/another')};
  assert.equal(invoke('hermes:agent:configureModel','parent',other).ok,false,'new endpoint must supply its own key');
  assert.equal((await invoke('hermes:discoverModels',other)).ok,false);
  assert.equal(requests,2,'no request can leak a key to the changed endpoint');
  assert.equal(invoke('hermes:agent:configureModel','child-a',second).ok,true,'other Agents reuse saved provider');
  preserved.forEach(file => assert.equal(read(file),'retained-'+file));
  assert.match(read('.hermes-console/agents/parent/config.yaml'),/max_turns: 7/);
  assert.match(read('.hermes-console/agents/parent/config.yaml'),/timeout: 91/);
  assert.equal(fs.readFileSync(database,'utf8'),'retained session database');
  assert.equal(fs.statSync(database).ino,databaseIdentity,'historical errors cannot replace an active database');
  assert.equal(JSON.parse(read('.hermes-console/agent-models.json')).parent.model,'model-two');
  assert.equal(JSON.parse(read('.hermes-console/custom-models.json')).length,2);
  // Reload the production module to prove persisted selection and encrypted keys survive restart.
  for (const name of handlers.keys()) ipcMain.removeHandler(name);
  handlers.clear();
  delete require.cache[require.resolve(path.join(root,'dist/main/main.js'))];
  app.whenReady = () => new Promise(() => {});
  require(path.join(root,'dist/main/main.js'));
  app.whenReady = ready;
  assert.equal(invoke('hermes:agent:state','parent').customPreset.model,'model-two');
  assert.equal((await invoke('hermes:discoverModels',second)).ok,true,'saved key works after restart');

  console.log('PASS: production model IPC, test-keychain encryption, discovery, provider reuse, endpoint isolation, all retained records');
}).catch(error => {console.error(error);process.exitCode=1;}).finally(() => {
  server.close(); fs.rmSync(home,{recursive:true,force:true}); app.exit(process.exitCode || 0);
});
setTimeout(() => { console.error('Electron model check timed out'); app.exit(1); }, 30_000).unref();
