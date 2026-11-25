import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readCodexCatalog, customModelId } from '../dist/main/model-catalog.js';
const builtins = [
 {id:'legacy-id',model:'old-model',provider:'openai-codex'},
 {id:'api',model:'vendor-model',provider:'openai'}
];
test('catalog updates, filters hidden models, preserves stored ids and API models', () => {
 const dir=mkdtempSync(path.join(tmpdir(),'hermes-models-')); const file=path.join(dir,'models.json');
 try {
  writeFileSync(file,JSON.stringify({models:[{slug:'new-model',display_name:'New',visibility:'list'},{slug:'old-model',visibility:'list'},{slug:'hidden',visibility:'hide'},{slug:'new-model',visibility:'list'},null]}));
  const models=readCodexCatalog(file,builtins);
  assert.deepEqual(models.map(m=>m.id),['codex-new-model','legacy-id','api']);
  writeFileSync(file,JSON.stringify({models:[{slug:'next-model',visibility:'list'}]}));
  assert.equal(readCodexCatalog(file,builtins)[0].model,'next-model');
  assert.ok(readCodexCatalog(file,builtins).some(m=>m.id==='legacy-id'));
  writeFileSync(file,'{broken'); assert.deepEqual(readCodexCatalog(file,builtins),builtins);
  writeFileSync(file,'{"models":[]}'); assert.equal(readCodexCatalog(file,builtins).find(p=>p.id==='legacy-id').available,false);
  assert.deepEqual(readCodexCatalog(path.join(dir,'missing'),builtins),builtins);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
test('credentials and models at different endpoints have different identities',()=>{
 const p={provider:'openai',model:'same',baseUrl:'https://one.test/v1'};
 assert.equal(customModelId(p),customModelId({...p,baseUrl:p.baseUrl+'/'}));
 assert.notEqual(customModelId(p),customModelId({...p,baseUrl:'https://two.test/v1'}));
 assert.notEqual(customModelId(p),customModelId({...p,model:'other'}));
});
