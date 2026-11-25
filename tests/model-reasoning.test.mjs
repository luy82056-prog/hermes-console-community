import test from 'node:test';
import assert from 'node:assert/strict';
import { applyModelReasoning } from '../dist/main/model-reasoning.js';
test('light preset changes only agent reasoning and is idempotent',()=>{
 const before='agent:\n  max_turns: 10\n  reasoning_effort: medium\nother:\n  reasoning_effort: high\n';
 const after=applyModelReasoning(before,'gpt-6-astra');
 assert.equal(after,'agent:\n  max_turns: 10\n  reasoning_effort: low\nother:\n  reasoning_effort: high\n');
 assert.equal(applyModelReasoning(after,'gpt-6-astra'),after);
 assert.equal(applyModelReasoning(before,'another-model'),before);
});
test('missing reasoning and agent blocks can be initialized',()=>{
 assert.equal(applyModelReasoning('agent:\n  max_turns: 3\n','gpt-6-astra'),'agent:\n  reasoning_effort: low\n  max_turns: 3\n');
 assert.match(applyModelReasoning('model:\n  default: example\n','gpt-6-astra'),/agent:\n  reasoning_effort: low/);
});
