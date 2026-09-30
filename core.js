(function(root){
'use strict';
const D=root.PCLAB_DATA, byId=Object.fromEntries(D.products.map(p=>[p.id,p]));
const required=['cpu','board','ram','storage','psu','case','cooler'];
function resolve(build){return Object.fromEntries(D.categories.map(c=>[c.id,byId[build[c.id]]?.cat===c.id?byId[build[c.id]]:null]));}
function analyze(build,budget=10000000,scenarioId='free'){
 const p=resolve(build), issues=[],add=(code,level,text,cats)=>issues.push({code,level,text,cats});
 const missing=required.filter(c=>!p[c]);
 if(missing.length)add('missing','info','Lengkapi: '+missing.map(c=>D.categories.find(k=>k.id===c).name).join(', ')+'.',missing);
 if(p.cpu&&p.board){
  if(p.cpu.socket!==p.board.socket)add('socket','error',`Soket berbeda: CPU ${p.cpu.socket}, motherboard ${p.board.socket}.`,['cpu','board']);
  else if(!p.board.families.includes(p.cpu.family))add('family','error',`Profil motherboard tidak mendukung generasi ${p.cpu.family}. Soket sama belum cukup.`,['cpu','board']);
 }
 if(p.ram&&p.board){
  if(p.ram.type!==p.board.memory)add('ram-type','error',`RAM ${p.ram.type} tidak sesuai board ${p.board.memory}.`,['ram','board']);
  if(p.ram.modules>p.board.slots)add('ram-slots','error',`${p.ram.modules} modul RAM membutuhkan lebih dari ${p.board.slots} slot yang tersedia.`,['ram','board']);
  if(p.ram.gb>p.board.maxRam)add('ram-max','error','Kapasitas RAM melampaui batas motherboard.', ['ram','board']);
 }
 if(p.ram&&p.cpu&&!p.cpu.memory.includes(p.ram.type))add('cpu-memory','error',`CPU tidak mendukung ${p.ram.type} pada profil ini.`,['cpu','ram']);
 if(p.board&&p.case&&!p.case.forms.includes(p.board.form))add('board-case','error',`Board ${p.board.form} tidak muat pada ${p.case.name}.`,['board','case']);
 if(p.storage&&p.board&&!(p.storage.interface==='NVMe'?p.board.nvme:p.board.sata))add('storage-port','error',`Board tidak menyediakan dukungan ${p.storage.interface} pada profil ini.`,['storage','board']);
 if(p.psu&&p.case&&!p.case.psu.includes(p.psu.form))add('psu-case','error',`Casing mendukung PSU ${p.case.psu.join('/')}, sedangkan PSU pilihan berformat ${p.psu.form}.`,['psu','case']);
 const discrete=p.gpu&&p.gpu.id!=='g-none';
 if(p.cpu&&!discrete&&!p.cpu.igpu)add('no-graphics','error','CPU tanpa grafis terintegrasi memerlukan GPU diskret untuk keluaran gambar.', ['cpu','gpu']);
 if(p.cpu?.igpu&&!discrete&&p.board&&!p.board.display)add('display','error','Motherboard tidak menyediakan keluaran layar untuk grafis terintegrasi.', ['cpu','board','gpu']);
 if(discrete&&p.case&&p.gpu.length>p.case.gpuMax)add('gpu-length','error',`GPU ${p.gpu.length} mm melampaui ruang casing ${p.case.gpuMax} mm.`,['gpu','case']);
 if(discrete&&p.psu&&p.gpu.pins>p.psu.pins)add('gpu-power','error',`GPU memerlukan ${p.gpu.pins} konektor PCIe 8-pin; PSU menyediakan ${p.psu.pins}.`,['gpu','psu']);
 if(p.cooler&&p.cpu){
  if(!p.cooler.sockets.includes(p.cpu.socket))add('cooler-socket','error','Kit soket pendingin tidak sesuai CPU.', ['cooler','cpu']);
  if(p.cooler.thermal<p.cpu.power)add('cooler-thermal','error','Batas termal profil pendingin lebih rendah dari asumsi daya CPU.', ['cooler','cpu']);
 }
 if(p.cooler&&p.case&&p.cooler.height>p.case.coolerMax)add('cooler-height','error',`Pendingin ${p.cooler.height} mm melampaui ruang casing ${p.case.coolerMax} mm.`,['cooler','case']);
 const load=(p.cpu?.power||0)+(p.gpu?.power||0)+(p.board?65:0)+(p.ram?8:0)+(p.storage?6:0);
 const recommended=Math.ceil(load*1.3/50)*50;
 if(p.psu&&p.psu.watts<load)add('power-low','error',`Kapasitas PSU ${p.psu.watts} W kurang dari estimasi model ${load} W.`,['psu','cpu','gpu']);
 else if(p.psu&&p.psu.watts<recommended)add('power-margin','warning',`PSU mencukupi estimasi dasar, tetapi di bawah target cadangan model ${recommended} W.`,['psu']);
 const total=Object.values(p).reduce((n,x)=>n+(x?.price||0),0);
 if(total>budget)add('budget','warning',`Total melampaui anggaran sebesar Rp${(total-budget).toLocaleString('id-ID')}.`,[]);
 const scenario=D.scenarios.find(s=>s.id===scenarioId)||D.scenarios[0],r=scenario.requirements;
 const targets=Object.entries(r).map(([k,min])=>{const actual={cores:p.cpu?.cores||0,ram:p.ram?.gb||0,storage:p.storage?.gb||0,vram:discrete?p.gpu.vram:0}[k];return {key:k,min,actual,pass:actual>=min};});
 return {p,issues,missing,load,recommended,total,targets,complete:missing.length===0,errors:issues.filter(x=>x.level==='error'),warnings:issues.filter(x=>x.level==='warning'),ready:missing.length===0&&!issues.some(x=>x.level==='error')};
}
function cleanState(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Format data tidak valid.');
 if(raw.version!==1)throw Error('Versi berkas tidak didukung. Gunakan berkas ekspor Rakit Lab versi 1.');
 if(!raw.build||typeof raw.build!=='object')throw Error('Daftar komponen tidak ditemukan.');
 const build={};for(const c of D.categories){const v=raw.build[c.id];if(v!=null){if(typeof v!=='string'||!byId[v]||byId[v].cat!==c.id)throw Error('Komponen tidak dikenal: '+c.name);build[c.id]=v;}}
 const str=(v,max)=>typeof v==='string'?v.slice(0,max):'';
 const budget=Number(raw.budget);if(!Number.isFinite(budget)||budget<1000000||budget>100000000)throw Error('Anggaran harus Rp1 juta–Rp100 juta.');
 if(!D.scenarios.some(s=>s.id===raw.scenario))throw Error('Skenario tidak dikenal.');
 return {version:1,build,budget,scenario:raw.scenario,name:str(raw.name,80),group:str(raw.group,80),reasons:[0,1,2].map(i=>str(raw.reasons?.[i],2000)),quiz:Array.isArray(raw.quiz)?D.quiz.map((q,i)=>Number.isInteger(raw.quiz[i])&&raw.quiz[i]>=0&&raw.quiz[i]<q.options.length?raw.quiz[i]:null):D.quiz.map(()=>null),assembly:Array.isArray(raw.assembly)?D.steps.filter(s=>raw.assembly.includes(s.id)).map(s=>s.id):[]};
}
root.PCLAB={byId,resolve,analyze,cleanState};
})(globalThis);
