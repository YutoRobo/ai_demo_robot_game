// Production optimizer integration: grid-native D4 pipeline generalized to the current game setup.
// The D5-verified algorithm/baseline definition is kept, while CPU, chassis and generation count come from the UI.
const __PRODUCTION_OPTIMIZER_VERSION='grid-native-d4-production-v9-json-program-io';

async function __loadOptimizerModule(path,ready){
  if(ready())return;
  const src=await fetch(path+'?v=20260824-prod-current-05',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(path+' '+r.status);return r.text();});
  (0,eval)(src);
  if(!ready())throw new Error(path+' initialization failed');
}

function __chooseProductionMasterSeed(ref){
  const pool=Array.isArray(ref?.VALIDATED_MASTER_SEEDS)&&ref.VALIDATED_MASTER_SEEDS.length?ref.VALIDATED_MASTER_SEEDS:ref?.MASTER_SEEDS?.slice(0,3);
  if(!pool?.length)throw new Error('D5 master-seed pool is empty');
  let i=0;
  try{const a=new Uint32Array(1);crypto.getRandomValues(a);i=a[0]%pool.length;}catch(_){i=Math.floor(Math.random()*pool.length);}
  return Number(pool[i])>>>0;
}

function __productionConfigSnapshot(){
  const cpu=(typeof cpuClass!=='undefined'&&CPU_CLASSES?.[cpuClass])?cpuClass:'standard';
  const ca=(typeof chassisBySide!=='undefined'&&CHASSIS_TYPES?.[chassisBySide.A])?chassisBySide.A:'standard';
  const cb=(typeof chassisBySide!=='undefined'&&CHASSIS_TYPES?.[chassisBySide.B])?chassisBySide.B:'standard';
  return{cpuClass:cpu,cpuLimit:typeof cpuChipLimit==='function'?cpuChipLimit():18,cpuDecisionMs:typeof cpuDecisionMs==='function'?cpuDecisionMs():120,chassisA:ca,chassisB:cb};
}

function __productionProgramHash(p){
  let h=2166136261>>>0,s=JSON.stringify(p);
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}
  return h.toString(16).padStart(8,'0');
}

function __normalizeProductionGenerations(value){
  const raw=Math.floor(Number(value)||20);
  return Math.max(20,Math.min(200,Math.round(raw/5)*5));
}

function __patchD4Generations(src,generations){
  const marker='const POP=300,K=6,PER_CLUSTER=50,GENERATIONS=20,ELITES=5;';
  const replacement=`const POP=300,K=6,PER_CLUSTER=50,GENERATIONS=${generations},ELITES=5;`;
  if(!src.includes(marker))throw new Error('D4 generation marker mismatch');
  return src.replace(marker,replacement);
}

function __patchD4ForCurrentChassis(src,chassisA,chassisB){
  const chassisMarker="const oldCh={A:chassisBySide.A,B:chassisBySide.B};chassisBySide.A=phaseChassisSel.value;chassisBySide.B=phaseChassisSel.value;";
  const chassisReplacement=`const oldCh={A:chassisBySide.A,B:chassisBySide.B};chassisBySide.A=${JSON.stringify(chassisA)};chassisBySide.B=${JSON.stringify(chassisB)};`;
  if(!src.includes(chassisMarker))throw new Error('D4 chassis marker mismatch');
  src=src.replace(chassisMarker,chassisReplacement);

  const evalMarker="function evaluate(x,opps,seeds,c){const before=hash(x.program);if(!structureOK(x,c))return{...finish(empty()),invalid:true};const m=empty();for(let i=0;i<opps.length;i++){const q=opps[i],seed=seeds[i%seeds.length],r1=simulateBattleWeaponAware(x.program,q.program,seed,x.weapons[0],x.weapons[1],q.weapons[0],q.weapons[1]),r2=simulateBattleWeaponAware(q.program,x.program,seed,q.weapons[0],q.weapons[1],x.weapons[0],x.weapons[1]);c.battles+=2;add(m,r1,'A');add(m,r2,'B');}if(hash(x.program)!==before)c.programHashViolations++;return finish(m);}";
  const evalReplacement="function evaluate(x,opps,seeds,c){const before=hash(x.program);if(!structureOK(x,c))return{...finish(empty()),invalid:true};const m=empty();for(let i=0;i<opps.length;i++){const q=opps[i],seed=seeds[i%seeds.length],r1=simulateBattleWeaponAware(x.program,q.program,seed,x.weapons[0],x.weapons[1],q.weapons[0],q.weapons[1]);const ca=chassisBySide.A,cb=chassisBySide.B;let r2;chassisBySide.A=cb;chassisBySide.B=ca;try{r2=simulateBattleWeaponAware(q.program,x.program,seed,q.weapons[0],q.weapons[1],x.weapons[0],x.weapons[1]);}finally{chassisBySide.A=ca;chassisBySide.B=cb;}c.battles+=2;add(m,r1,'A');add(m,r2,'B');}if(hash(x.program)!==before)c.programHashViolations++;return finish(m);}";
  if(!src.includes(evalMarker))throw new Error('D4 evaluation marker mismatch');
  return src.replace(evalMarker,evalReplacement);
}

optimizeHybrid=async function(maxGenerations=20){
  running=false;startBtn.textContent='戦闘開始';optimizeBtn.disabled=true;
  const generations=__normalizeProductionGenerations(maxGenerations);
  const config=__productionConfigSnapshot();
  const beforeHash=__productionProgramHash(programs.A),beforeWeapons=[weaponA1Sel.value,weaponA2Sel.value];
  if(typeof maxGenInput!=='undefined'&&maxGenInput){maxGenInput.value=String(generations);}
  const cpuName=CPU_CLASSES?.[config.cpuClass]?.name||config.cpuClass;
  const chAName=CHASSIS_TYPES?.[config.chassisA]?.name||config.chassisA;
  const chBName=CHASSIS_TYPES?.[config.chassisB]?.name||config.chassisB;
  statusEl.textContent=`現在設定（${cpuName} / 自機${chAName} / 敵機${chBName} / ${generations}世代）で強さ優先探索を準備中…`;
  evoGen.textContent='準備中';evoBattles.textContent='0';evoBest.textContent='-';evoProgress.style.width='1%';
  evoDetail.textContent=`${generations}世代 / CPU ${cpuName} ${config.cpuLimit}チップ ${config.cpuDecisionMs}ms / ${chAName} vs ${chBName}。5世代ごとにValidation checkpointを保存します。`;
  await new Promise(r=>requestAnimationFrame(()=>r()));

  try{
    await __loadOptimizerModule('./chip-catalog.js',()=>window.__chipCatalog?.version==='chip-catalog-v0.1');
    await __loadOptimizerModule('./structural-evolution.js',()=>window.__structuralEvolution?.VERSION==='grid-native-structure-v0.4-metadata');
    await __loadOptimizerModule('./d5-reference-config.js',()=>/^d5-reference-config-v0\.[12]$/.test(window.__D5ReferenceConfig?.VERSION||''));
    if(!simulateBattleWeaponAware?.__authoritativeMeasured)throw new Error('authoritative-measured-v2 simulator is not active');
    if(typeof cpuChipLimit!=='function'||cpuChipLimit()!==config.cpuLimit||typeof cpuDecisionMs!=='function'||cpuDecisionMs()!==config.cpuDecisionMs)throw new Error('CPU setting changed during search setup');
    if(chassisBySide?.A!==config.chassisA||chassisBySide?.B!==config.chassisB)throw new Error('chassis setting changed during search setup');

    const ref=window.__D5ReferenceConfig;
    const phaseStatus={set textContent(v){statusEl.textContent=v;},get textContent(){return statusEl.textContent;}};
    const phaseSummary={set textContent(v){evoDetail.textContent=v;},get textContent(){return evoDetail.textContent;}};
    const phaseProgress={style:evoProgress.style};
    const phaseReport={textContent:''};
    const phaseChassisSel={get value(){return config.chassisA;}};
    const seed=__chooseProductionMasterSeed(ref);
    let src=await fetch('./phase-d4-evolution.js?v=20260824-prod-current-05',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('phase-d4-evolution.js '+r.status);return r.text();});
    src=ref.patchD4Source(src,seed,`${__PRODUCTION_OPTIMIZER_VERSION}-${generations}g-seed-${seed}`);
    src=__patchD4Generations(src,generations);
    src=__patchD4ForCurrentChassis(src,config.chassisA,config.chassisB);
    window.__phaseD4=null;
    eval(src);
    if(!window.__phaseD4)throw new Error('D4 production engine install failed');

    const report=await window.__phaseD4.run();
    if(!report?.pass)throw new Error('D4 audit failed');
    const snap=report.selectedCheckpoint?.champion?.snapshot,val=report.selectedCheckpoint?.champion?.metrics,test=report.finalTest?.metrics;
    if(!snap?.program||!Array.isArray(snap.weapons)||snap.weapons.length<2)throw new Error('selected checkpoint is incomplete');

    const selectedProgram=cloneProgram(snap.program),selectedWeapons=snap.weapons.slice();
    programs.A=cloneProgram(selectedProgram);
    weaponA1Sel.value=selectedWeapons[0];weaponA2Sel.value=selectedWeapons[1];
    editSide='A';selectedCell=1;
    if(typeof resetWorld==='function')resetWorld();
    renderProgram();

    evoGen.textContent=`${generations} / ${generations} (選択 ${report.selectedCheckpoint.generation})`;
    evoBattles.textContent=String(report.counters?.battles||0);
    evoBest.textContent=((val?.winRate||0)*100).toFixed(1)+'%';evoProgress.style.width='100%';
    evoDetail.textContent=`完了：${generations}世代 / 選択checkpoint ${report.selectedCheckpoint.generation} / Validation ${(100*(val?.winRate||0)).toFixed(1)}% / Test ${(100*(test?.winRate||0)).toFixed(1)}% / Damage ${(test?.avgDamage||0).toFixed(2)} / ${snap.weapons.join(' + ')} / checkpoint ${snap.hash} / seed ${seed} / CPU ${cpuName} ${config.cpuLimit}チップ ${config.cpuDecisionMs}ms / ${chAName} vs ${chBName}`;

    const meta={optimizer:__PRODUCTION_OPTIMIZER_VERSION,referenceConfigVersion:ref.VERSION,masterSeed:seed,masterSeedPool:(ref.VALIDATED_MASTER_SEEDS||ref.MASTER_SEEDS||[]).slice(0,3),searchConfig:{...config,generations},selectedGeneration:report.selectedCheckpoint.generation,validationWinRate:val?.winRate||0,testWinRate:test?.winRate||0,testAvgDamage:test?.avgDamage||0,checkpointHash:snap.hash,weapons:snap.weapons.slice(),audit:{invalidToEvaluation:report.counters?.invalidToEvaluation,runtimeHashViolations:report.counters?.runtimeHashViolations,programHashViolations:report.counters?.programHashViolations,eliteHashViolations:report.counters?.eliteHashViolations,checkpointHashViolations:report.counters?.checkpointHashViolations,testEvaluations:report.counters?.testEvaluations}};
    if(typeof saveOptimizedResult==='function')saveOptimizedResult(meta);
    window.__lastProductionD4Report=report;

    setTimeout(()=>{
      programs.A=cloneProgram(selectedProgram);
      weaponA1Sel.value=selectedWeapons[0];weaponA2Sel.value=selectedWeapons[1];
      editSide='A';selectedCell=1;
      if(state?.A){state.A.pc=0;state.A.acc=0;}
      renderProgram();
      const appliedHash=__productionProgramHash(programs.A),ok=appliedHash===snap.hash;
      const changed=beforeHash!==appliedHash||JSON.stringify(beforeWeapons)!==JSON.stringify(selectedWeapons);
      evoDetail.textContent+=` / 反映hash ${appliedHash}${ok?' 一致':' 不一致'} / ${changed?'盤面更新あり':'同一結果を再選出'}`;
      statusEl.textContent=ok?(changed?`探索結果を自機へ反映しました。盤面が ${beforeHash} → ${appliedHash} に更新されました。`:`探索結果は正しく反映済みです。今回は探索前と同じcheckpoint ${appliedHash} が再選出されたため、盤面の見た目は変わりません。`):`探索結果の反映hashが不一致です：checkpoint ${snap.hash} / 盤面 ${appliedHash}`;
      window.__lastProductionInstallCheck={checkpointHash:snap.hash,appliedHash,match:ok,changed,beforeHash,weapons:selectedWeapons.slice(),generations};
    },0);
    return report;
  }catch(err){
    console.error(err);statusEl.textContent='探索エラー：'+(err?.message||err);evoDetail.textContent='探索エラー：'+(err?.message||err)+' / 本番AIは変更していません。';throw err;
  }finally{optimizeBtn.disabled=false;}
};

const __AI_JSON_FORMAT='robot-ai-battle-program-v1';
const __AI_JSON_DIRS=new Set(['U','R','D','L']);
function __exportSelfAiJson(){
  const hash=__productionProgramHash(programs.A);
  const report=window.__lastProductionD4Report;
  const payload={
    format:__AI_JSON_FORMAT,
    version:1,
    exportedAt:new Date().toISOString(),
    programHash:hash,
    program:cloneProgram(programs.A),
    weapons:[weaponA1Sel.value,weaponA2Sel.value],
    cpuClass:typeof cpuClass!=='undefined'?cpuClass:'standard',
    chassisA:typeof chassisBySide!=='undefined'?chassisBySide.A:'standard',
    source:{optimizer:__PRODUCTION_OPTIMIZER_VERSION,selectedGeneration:report?.selectedCheckpoint?.generation??null,checkpointHash:report?.selectedCheckpoint?.champion?.snapshot?.hash??hash}
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  a.href=url;a.download=`robot-ai-${hash}-${stamp}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  statusEl.textContent=`自機AIをJSON保存しました。program hash ${hash}`;
}

function __validateImportedAiJson(data){
  if(!data||typeof data!=='object')throw new Error('JSONの形式が不正です');
  if(data.format!==__AI_JSON_FORMAT)throw new Error('対応していないJSON形式です');
  const p=data.program;
  if(!Array.isArray(p)||p.length!==36)throw new Error('programは36セル配列である必要があります');
  const defs=new Map(chipTypes.map(x=>[x[0],x[2]]));
  for(let i=0;i<36;i++){
    const c=p[i];if(c==null)continue;
    if(i===0)throw new Error('セル0はSTART固定なのでnullである必要があります');
    if(typeof c!=='object'||!defs.has(c.type))throw new Error(`セル${i}: 未対応チップです`);
    const expected=defs.get(c.type);if(c.kind!==expected)throw new Error(`セル${i}: kindがチップ定義と一致しません`);
    if(c.kind==='action'){
      if(!__AI_JSON_DIRS.has(c.next))throw new Error(`セル${i}: next方向が不正です`);
    }else{
      if(!__AI_JSON_DIRS.has(c.yes)||!__AI_JSON_DIRS.has(c.no))throw new Error(`セル${i}: 分岐方向が不正です`);
    }
  }
  const cpu=data.cpuClass&&CPU_CLASSES?.[data.cpuClass]?data.cpuClass:(typeof cpuClass!=='undefined'?cpuClass:'standard');
  const limit=CPU_CLASSES?.[cpu]?.limit||18;
  const count=p.slice(1).filter(Boolean).length;
  if(count>limit)throw new Error(`CPU上限超過です：${count}/${limit}チップ`);
  const weapons=Array.isArray(data.weapons)&&data.weapons.length>=2?data.weapons.slice(0,2):null;
  const validWeapons=new Set(['rifle','burst','heavy','rapid','mine','killer']);
  if(!weapons||!weapons.every(w=>validWeapons.has(w)))throw new Error('武器設定が不正です');
  return{program:cloneProgram(p),weapons,cpuClass:cpu,chassisA:data.chassisA&&CHASSIS_TYPES?.[data.chassisA]?data.chassisA:null,expectedHash:data.programHash||null};
}

async function __importSelfAiJsonFile(file){
  if(!file)return;
  const data=JSON.parse(await file.text()),x=__validateImportedAiJson(data);
  if(typeof cpuClass!=='undefined')cpuClass=x.cpuClass;
  if(typeof cpuClassSel!=='undefined'&&cpuClassSel)cpuClassSel.value=x.cpuClass;
  try{localStorage.setItem('robot-ai-battle-v1-cpu-class',x.cpuClass);}catch(_e){}
  if(x.chassisA&&typeof chassisBySide!=='undefined'){
    chassisBySide.A=x.chassisA;
    if(typeof chassisASel!=='undefined'&&chassisASel)chassisASel.value=x.chassisA;
    if(typeof saveChassisSelection==='function')saveChassisSelection();
    if(typeof updateChassisInfo==='function')updateChassisInfo();
  }
  programs.A=cloneProgram(x.program);
  weaponA1Sel.value=x.weapons[0];weaponA2Sel.value=x.weapons[1];
  editSide='A';selectedCell=1;
  if(typeof resetWorld==='function')resetWorld();
  if(state?.A){state.A.pc=0;state.A.acc=0;}
  renderProgram();
  const hash=__productionProgramHash(programs.A);
  if(x.expectedHash&&hash!==x.expectedHash)throw new Error(`読み込みhash不一致：JSON ${x.expectedHash} / 盤面 ${hash}`);
  if(typeof saveOptimizedResult==='function')saveOptimizedResult({importedJson:true,checkpointHash:hash,weapons:x.weapons.slice(),cpuClass:x.cpuClass,chassisA:x.chassisA});
  statusEl.textContent=`JSONから自機AIを読み込みました。program hash ${hash}`;
}

(function __installProductionD4Ui(){
  try{
    if(typeof maxGenInput!=='undefined'&&maxGenInput){
      maxGenInput.value='20';maxGenInput.min='20';maxGenInput.max='200';maxGenInput.step='5';maxGenInput.disabled=false;maxGenInput.readOnly=false;maxGenInput.title='20〜200世代、5世代刻みで指定できます';
      const label=maxGenInput.closest('label');
      if(label&&!root.querySelector('#generationQuickSelect')){
        const wrap=document.createElement('div');wrap.id='generationQuickSelect';wrap.style.cssText='display:flex;gap:6px;flex-wrap:wrap;margin-top:6px';
        for(const g of [20,50,100,200]){const b=document.createElement('button');b.type='button';b.textContent=g+'世代';b.style.minHeight='34px';b.style.padding='5px 9px';b.addEventListener('click',()=>{maxGenInput.value=String(g);statusEl.textContent=`最大世代を${g}に設定しました。`;});wrap.appendChild(b);}label.parentNode.appendChild(wrap);
      }
    }
    if(typeof optimizeBtn!=='undefined'&&optimizeBtn){optimizeBtn.textContent='強さ優先探索';optimizeBtn.title='現在選択中のCPU・自機・敵機条件と指定世代数で探索';}
    const section=optimizeBtn?.closest('.section');
    if(section&&!root.querySelector('#aiJsonIo')){
      const box=document.createElement('div');box.id='aiJsonIo';box.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center';
      const save=document.createElement('button');save.type='button';save.textContent='自機JSON保存';save.addEventListener('click',__exportSelfAiJson);
      const load=document.createElement('button');load.type='button';load.textContent='JSON読込';
      const input=document.createElement('input');input.type='file';input.accept='application/json,.json';input.style.display='none';
      load.addEventListener('click',()=>{input.value='';input.click();});
      input.addEventListener('change',async()=>{try{await __importSelfAiJsonFile(input.files?.[0]);}catch(e){console.error(e);statusEl.textContent='JSON読込エラー：'+(e?.message||e);}});
      const note=document.createElement('span');note.className='mini';note.textContent='探索後の自機チップ配列・武器・CPU・機体を端末へ保存／復元';
      box.append(save,load,input,note);section.appendChild(box);
    }
  }catch(e){console.warn('production D4 UI setup failed',e);}
})();
