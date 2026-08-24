// Metadata-driven chip catalog shared by structural evolution and future optimizers.
// Adding a chip should normally require only a definition here (plus its runtime behavior).
(function installChipCatalog(){
  const defs=[
    {type:'forward',category:'movement',subCategory:'translation'},
    {type:'back',category:'movement',subCategory:'translation'},
    {type:'strafeL',category:'movement',subCategory:'translation'},
    {type:'strafeR',category:'movement',subCategory:'translation'},
    {type:'evade',category:'movement',subCategory:'evasion'},
    {type:'turnL',category:'orientation',subCategory:'turn'},
    {type:'turnR',category:'orientation',subCategory:'turn'},
    {type:'aim',category:'orientation',subCategory:'aim'},
    {type:'weapon1',category:'weapon',subCategory:'slot'},
    {type:'weapon2',category:'weapon',subCategory:'slot'},
    {type:'flagOn',category:'state',subCategory:'flag'},
    {type:'flagOff',category:'state',subCategory:'flag'},
    {type:'timerStart',category:'state',subCategory:'timer'},
    {type:'wait',category:'state',subCategory:'wait'},
    {type:'enemyFront',category:'sensor',subCategory:'geometry'},
    {type:'enemyLeft',category:'sensor',subCategory:'geometry'},
    {type:'enemyRight',category:'sensor',subCategory:'geometry'},
    {type:'enemyFacingMe',category:'sensor',subCategory:'geometry'},
    {type:'behindEnemy',category:'sensor',subCategory:'geometry'},
    {type:'enemyNear',category:'sensor',subCategory:'distance'},
    {type:'enemyFar',category:'sensor',subCategory:'distance'},
    {type:'enemyWithin100',category:'sensor',subCategory:'distance'},
    {type:'enemyWithin200',category:'sensor',subCategory:'distance'},
    {type:'enemyWithin300',category:'sensor',subCategory:'distance'},
    {type:'enemyInNarrowFov',category:'sensor',subCategory:'detection'},
    {type:'enemyInMediumFov',category:'sensor',subCategory:'detection'},
    {type:'enemyInWideFov',category:'sensor',subCategory:'detection'},
    {type:'bulletNear',category:'sensor',subCategory:'threat'},
    {type:'bulletLeft',category:'sensor',subCategory:'threat'},
    {type:'bulletRight',category:'sensor',subCategory:'threat'},
    {type:'lostEnemy',category:'sensor',subCategory:'tracking'},
    {type:'wallNear',category:'environment',subCategory:'wall'},
    {type:'hpLow',category:'self',subCategory:'health'},
    {type:'hitRecent',category:'self',subCategory:'damage'},
    {type:'flagSet',category:'state',subCategory:'flag'},
    {type:'timer2s',category:'state',subCategory:'timer'},
    {type:'canShoot',category:'weapon',subCategory:'availability'},
    {type:'weapon1Ammo',category:'weapon',subCategory:'availability'},
    {type:'weapon2Ammo',category:'weapon',subCategory:'availability'}
  ];
  const registry=new Map();
  function tupleFor(type){return typeof chipTypes!=='undefined'?chipTypes.find(x=>x[0]===type):null;}
  function inferKind(type){return tupleFor(type)?.[2]||null;}
  function registerChipDefinition(def){
    if(!def||!def.type)throw new Error('chip definition requires type');
    const old=registry.get(def.type)||{};
    const kind=def.kind||old.kind||inferKind(def.type);
    const meta={...old,...def,kind};
    if(!meta.kind)throw new Error('chip definition requires kind for '+def.type);
    meta.capabilities=Array.isArray(meta.capabilities)?meta.capabilities.slice():(meta.kind==='cond'?['sensor']:[meta.category].filter(x=>['movement','orientation','weapon'].includes(x)));
    registry.set(meta.type,meta);
    if(typeof chipTypes!=='undefined'&&!tupleFor(meta.type)&&meta.label)chipTypes.push([meta.type,meta.label,meta.kind]);
    return meta;
  }
  for(const d of defs){const t=tupleFor(d.type);if(t)registerChipDefinition({...d,label:t[1],kind:t[2]});}
  if(typeof chipTypes!=='undefined')for(const t of chipTypes)if(!registry.has(t[0]))registerChipDefinition({type:t[0],label:t[1],kind:t[2],category:t[2]==='cond'?'sensor':'state',subCategory:'other'});
  function chipDefinition(type){return registry.get(type)||null;}
  function chipTypesByKind(kind){return [...registry.values()].filter(d=>d.kind===kind).map(d=>d.type);}
  function chipTypesByCategory(category,kind=null){return [...registry.values()].filter(d=>d.category===category&&(!kind||d.kind===kind)).map(d=>d.type);}
  function compatibleChipTypes(type){
    const m=chipDefinition(type);if(!m)return[];
    let xs=[...registry.values()].filter(d=>d.type!==type&&d.kind===m.kind&&d.category===m.category&&d.subCategory===m.subCategory);
    if(!xs.length)xs=[...registry.values()].filter(d=>d.type!==type&&d.kind===m.kind&&d.category===m.category);
    return xs.map(d=>d.type);
  }
  function chipProvides(type,capability){return !!chipDefinition(type)?.capabilities?.includes(capability);}
  window.__chipCatalog={version:'chip-catalog-v0.1',registry,registerChipDefinition,chipDefinition,chipTypesByKind,chipTypesByCategory,compatibleChipTypes,chipProvides};
  window.registerChipDefinition=registerChipDefinition;
  window.chipDefinition=chipDefinition;
  window.chipTypesByKind=chipTypesByKind;
  window.chipTypesByCategory=chipTypesByCategory;
  window.compatibleChipTypes=compatibleChipTypes;
  window.chipProvides=chipProvides;
})();

// Search-parameter UI and structural-diffusion wrapper.
// Selection criteria remain untouched; only candidate-generation pressure changes.
(function installStructuralSearchParameters(){
  const KEY='robot-ai-battle-v1-structural-search-params';
  const PRESETS={
    standard:{crossover:20,multiRate:0,multiExtra:1,replaceAction:20,replaceCondition:16,insertAction:16,insertCondition:22,removeAction:10,collapseCondition:6,weaponMutation:10},
    diffuse:{crossover:30,multiRate:35,multiExtra:2,replaceAction:13,replaceCondition:12,insertAction:24,insertCondition:28,removeAction:5,collapseCondition:3,weaponMutation:8}
  };
  let current={...PRESETS.diffuse};
  try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved&&typeof saved==='object')current={...current,...saved};}catch(_e){}
  const clamp=(v,lo,hi,d)=>Math.max(lo,Math.min(hi,Number.isFinite(Number(v))?Number(v):d));
  function normalized(){return{
    crossover:clamp(current.crossover,0,80,30),multiRate:clamp(current.multiRate,0,100,35),multiExtra:Math.round(clamp(current.multiExtra,1,4,2)),
    replaceAction:clamp(current.replaceAction,0,100,13),replaceCondition:clamp(current.replaceCondition,0,100,12),insertAction:clamp(current.insertAction,0,100,24),insertCondition:clamp(current.insertCondition,0,100,28),removeAction:clamp(current.removeAction,0,100,5),collapseCondition:clamp(current.collapseCondition,0,100,3),weaponMutation:clamp(current.weaponMutation,0,100,8)
  };}
  function save(){current=normalized();try{localStorage.setItem(KEY,JSON.stringify(current));}catch(_e){}window.__structuralSearchParams={...current};}
  save();
  function applyStructuralWeights(){
    const e=window.__structuralEvolution;if(!e?.cfg)return;
    const p=normalized(),w=e.cfg.operatorWeights;
    w.replaceAction=p.replaceAction;w.replaceCondition=p.replaceCondition;w.insertActionRepack=p.insertAction;w.insertConditionBranch=p.insertCondition;w.removeActionRepack=p.removeAction;w.collapseCondition=p.collapseCondition;w.weaponMutation=p.weaponMutation;w.extendBranch=0;
    e.cfg.disabledOperators=['redirectEdge','extendBranch'];
    window.__structuralSearchParams={...p};
  }
  function patchD4Source(src,p){
    const crossMarker="const CROSS=.20,WEAPONS=['rifle','burst','heavy','rapid','mine','killer'];";
    if(src.includes(crossMarker))src=src.replace(crossMarker,`const CROSS=${(p.crossover/100).toFixed(4)},WEAPONS=['rifle','burst','heavy','rapid','mine','killer'];`);
    const mutateMarker="function mutate(p,r,g){let prog=p.program,w=p.weapons.slice(),op='weaponProfileMutation';if(r()<.15)w[Math.floor(r()*2)]=pick(WEAPONS,r);else{const m=E().mutateStructured(p.program,r);prog=m.program;op=m.operator;}return ind(prog,w,op,[p.id],g);}";
    if(src.includes(mutateMarker)){
      const mr=(p.multiRate/100).toFixed(4),mx=Math.max(1,Math.round(p.multiExtra));
      const replacement=`function mutate(p,r,g){let prog=p.program,w=p.weapons.slice(),ops=[];if(r()<.15){w[Math.floor(r()*2)]=pick(WEAPONS,r);ops.push('weaponProfileMutation');}else{const steps=1+(r()<${mr}?1+Math.floor(r()*${mx}):0);for(let z=0;z<steps;z++){const m=E().mutateStructured(prog,r);prog=m.program;ops.push(m.operator);}}return ind(prog,w,ops.join('+')||'mutation',[p.id],g);}`;
      src=src.replace(mutateMarker,replacement);
    }
    return src;
  }
  function installUi(){
    if(typeof root==='undefined'||typeof optimizeBtn==='undefined'||!optimizeBtn||root.querySelector('#structuralSearchParams'))return;
    const section=optimizeBtn.closest('.section');if(!section)return;
    const d=document.createElement('details');d.id='structuralSearchParams';d.style.cssText='margin-top:9px;padding:8px;border:1px solid rgba(128,128,128,.35);border-radius:10px';
    const s=document.createElement('summary');s.textContent='構造探索パラメータ';s.style.cssText='cursor:pointer;font-weight:700';d.appendChild(s);
    const note=document.createElement('div');note.className='mini';note.style.margin='6px 0';note.textContent='選択評価は変えず、候補生成の広がりだけを調整します。標準は従来値、拡散強めは挿入・交叉・連続変異を増やします。';d.appendChild(note);
    const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px';
    const defs=[['crossover','交叉率 %',0,80,5],['multiRate','複数変異率 %',0,100,5],['multiExtra','追加変異 最大',1,4,1],['insertAction','Action挿入 重み',0,100,1],['insertCondition','条件分岐挿入 重み',0,100,1],['removeAction','Action削除 重み',0,100,1],['collapseCondition','条件縮約 重み',0,100,1],['replaceAction','Action置換 重み',0,100,1],['replaceCondition','条件置換 重み',0,100,1],['weaponMutation','武器チップ変異 重み',0,100,1]];
    const inputs={};
    for(const [k,label,min,max,step] of defs){const l=document.createElement('label');l.className='mini';l.textContent=label;const i=document.createElement('input');i.type='number';i.min=String(min);i.max=String(max);i.step=String(step);i.value=String(current[k]);i.style.cssText='width:100%;margin-top:2px';i.addEventListener('change',()=>{current[k]=i.value;save();});l.appendChild(i);grid.appendChild(l);inputs[k]=i;}
    d.appendChild(grid);
    const row=document.createElement('div');row.style.cssText='display:flex;gap:6px;flex-wrap:wrap;margin-top:8px';
    function presetButton(label,name){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',()=>{current={...PRESETS[name]};save();for(const k of Object.keys(inputs))inputs[k].value=String(current[k]);if(typeof statusEl!=='undefined')statusEl.textContent=`構造探索を「${label}」に設定しました。`;});return b;}
    row.append(presetButton('標準','standard'),presetButton('拡散強め','diffuse'));d.appendChild(row);section.appendChild(d);
  }
  setTimeout(()=>{
    try{
      installUi();
      if(typeof optimizeHybrid!=='function'||optimizeHybrid.__structuralParamWrapped)return;
      const base=optimizeHybrid;
      const wrapped=async function(maxGenerations){
        save();applyStructuralWeights();const p=normalized(),oldFetch=window.fetch;
        window.fetch=async function(input,init){const url=typeof input==='string'?input:(input?.url||'');const res=await oldFetch.call(this,input,init);if(!url.includes('phase-d4-evolution.js'))return res;const text=await res.text();return new Response(patchD4Source(text,p),{status:res.status,statusText:res.statusText,headers:res.headers});};
        try{
          if(typeof evoDetail!=='undefined')evoDetail.textContent=`構造拡散：交叉${p.crossover}% / 複数変異${p.multiRate}% / 挿入重み ${p.insertAction}+${p.insertCondition}`;
          return await base(maxGenerations);
        }finally{window.fetch=oldFetch;}
      };
      wrapped.__structuralParamWrapped=true;wrapped.__baseOptimize=base;optimizeHybrid=wrapped;
    }catch(e){console.warn('structural search parameter install failed',e);}
  },0);
})();