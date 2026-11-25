export const permissionHtml = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
<title>Hermes · 权限申请</title><style>
*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden}
body{font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#f7f7f8;color:#202329;display:flex;flex-direction:column}
header{flex:none;padding:20px 24px 14px;border-bottom:1px solid #ddd}h1{font-size:19px;margin:0 0 8px}#summary{margin:0;color:#515763;overflow-wrap:anywhere;max-height:65px;overflow:auto;line-height:1.5}
main{flex:1;min-height:0;padding:14px 24px;display:flex;flex-direction:column;gap:8px}small{color:#676c76}
pre{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;margin:0;padding:14px;background:white;border:1px solid #dadde2;border-radius:10px;font:13px/1.6 ui-monospace,SFMono-Regular,monospace;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text}
footer{flex:none;padding:14px 24px 18px;border-top:1px solid #ddd;background:#fff}label{display:flex;align-items:flex-start;gap:8px;line-height:1.5}input{margin:3px 0 0}#hint{margin:5px 0 12px 23px;color:#666;font-size:12px;line-height:1.5}
.actions{display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap}button,select{font:inherit;border:1px solid #ccd0d7;border-radius:7px;background:#fff;padding:9px 13px;cursor:pointer;max-width:100%}button:focus-visible,select:focus-visible{outline:3px solid #99b5ff;outline-offset:2px}.primary{background:#255fe7;color:white;border-color:#255fe7}#error{color:#b42318;margin:0 0 8px}#extra{max-width:180px}
@media(max-height:440px){header{padding:10px 16px}main{padding:8px 16px}footer{padding:8px 16px}#hint{margin-bottom:6px}}
</style></head><body>
<header><h1>权限申请</h1><p id="summary"></p></header>
<main><small>操作详情 · 可滚动查看和复制</small><pre id="detail" tabindex="0"></pre></main>
<footer><label id="autoLabel"><input id="auto" type="checkbox">后续全部自动允许</label>
<p id="hint">适用于所有 Console Agent，重启后保留。可在菜单「权限」中关闭。</p>
<p id="error" role="alert" hidden></p><div class="actions"><select id="extra" aria-label="其他授权选项" hidden></select><button id="cancel">取消</button><button id="deny" hidden>拒绝</button><button id="once" hidden>允许一次</button><button id="all" class="primary" hidden>允许全部</button></div></footer>
<script>
const $=id=>document.getElementById(id);let data;let submitting=false;
async function submit(response,allowAll){if(submitting)return;submitting=true;try{const result=await window.permission.submit(response,allowAll);if(result&&result.error){$('error').textContent=result.error;$('error').hidden=false;submitting=false;}}catch(e){$('error').textContent='提交失败，请重试。';$('error').hidden=false;submitting=false;}}
window.permission.load().then(value=>{data=value;$('summary').textContent=data.message;$('detail').textContent=data.detail;
const preferred=data.autoAllowResponse;const denied=data.buttons.findIndex((name,index)=>index>0&&(name==='拒绝'||name==='始终拒绝'));
$('cancel').onclick=()=>submit(0,false);
if(denied>0){$('deny').hidden=false;$('deny').onclick=()=>submit(denied,false);}
if(preferred!==null){$('once').hidden=false;$('once').textContent=data.buttons[preferred];$('once').onclick=()=>submit(preferred,$('auto').checked);$('all').hidden=false;$('all').onclick=()=>submit(preferred,true);$('auto').onchange=()=>{if($('auto').checked)submit(preferred,true);};}else{$('autoLabel').hidden=true;$('hint').hidden=true;}
const extra=data.buttons.map((name,index)=>({name,index})).filter(x=>x.index>0&&x.index!==preferred&&x.index!==denied);
if(extra.length){$('extra').hidden=false;const placeholder=document.createElement('option');placeholder.textContent='其他选项…';placeholder.value='';$('extra').append(placeholder);for(const item of extra){const option=document.createElement('option');option.textContent=item.name;option.value=String(item.index);$('extra').append(option);}$('extra').onchange=()=>{if($('extra').value)submit(Number($('extra').value),$('auto').checked);};}
$('cancel').focus();}).catch(()=>{$('error').textContent='无法读取权限请求，请关闭窗口后重试。';$('error').hidden=false;});
document.addEventListener('keydown',event=>{if(event.key==='Escape')submit(0,false);});
</script></body></html>`;
