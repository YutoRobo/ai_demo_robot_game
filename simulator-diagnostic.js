// Deterministic simulator consistency diagnostic. Injected inside the game closure.
(function installSimulatorDiagnostic(){
  const DIAG_SEED=1908082401;
  function safeHealth(p){try{return typeof cpuProgramHealth==='function'?cpuProgramHealth(p):null;}catch(_e){return null;}}
  function statsSummary(r,side='A'){
    const st=r?.stats?.[side]||{},ac=r?.activity?.[side]||{};
    return{
      hpA:r?.a??null,hpB:r?.b??null,winner:r?.winner??null,resolved:!!r?.resolved,
      shoot:Number(st.shoot||0),mine:Number(st.mine||0),killer:Number(st.killer||0),damage:Number(st.damage||0),
      move:Number(st.move||0),evade:Number(st.evade||0),aim:Number(st.aim||0),turn:Number(st.turn||0),visitedCount:Number(st.visitedCount||0),
      activityAttacks:Number(ac.attacks||0),activityTranslation:Number(ac.translation||0),activityOrientation:Number(ac.orientation||0),activityNonCombat:ac.nonCombat??null
    };
  }
  function sameKey(a,b,k){return a?.[k]===b?.[k];}
  function compareSummaries(a,b){
    const keys=['winner','resolved','shoot','mine','killer','damage','move','evade','aim','turn','visitedCount'];
    const diffs=keys.filter(k=>!sameKey(a,b,k));
    return{equal:diffs.length===0,diffs};
  }
  function oneChip(type){const p=Array(36).fill(null);p[1]={type,kind:'action',next:'L'};return p;}
  function makeReport(){
    const pa=cloneProgram(handDesignedChampion('A'));
    const pb=cloneProgram(handDesignedChampion('B'));
    const ta=typeof trimProgramToCpu==='function'?trimProgramToCpu(pa):cloneProgram(pa);
    const tb=typeof trimProgramToCpu==='function'?trimProgramToCpu(pb):cloneProgram(pb);
    const w={a1:'rifle',a2:'mine',b1:'burst',b2:'killer'};
    const rawFn=(typeof baseSimCpu==='function')?baseSimCpu:null;
    const wrappedFn=(typeof simulateBattleWeaponAware==='function')?simulateBattleWeaponAware:null;
    const raw=rawFn?rawFn(pa,pb,DIAG_SEED,w.a1,w.a2,w.b1,w.b2):null;
    const rawTrim=rawFn?rawFn(ta,tb,DIAG_SEED,w.a1,w.a2,w.b1,w.b2):null;
    const wrapped=wrappedFn?wrappedFn(pa,pb,DIAG_SEED,w.a1,w.a2,w.b1,w.b2):null;
    const wait=oneChip('wait'),attack=oneChip('weapon1'),move=oneChip('forward'),turn=oneChip('turnR');
    const probes={
      attackCore:rawFn?statsSummary(rawFn(attack,wait,DIAG_SEED+11,'rifle','mine','rifle','mine')):null,
      moveCore:rawFn?statsSummary(rawFn(move,wait,DIAG_SEED+12,'rifle','mine','rifle','mine')):null,
      turnCore:rawFn?statsSummary(rawFn(turn,wait,DIAG_SEED+13,'rifle','mine','rifle','mine')):null,
      attackOptimizer:wrappedFn?statsSummary(wrappedFn(attack,wait,DIAG_SEED+11,'rifle','mine','rifle','mine')):null,
      moveOptimizer:wrappedFn?statsSummary(wrappedFn(move,wait,DIAG_SEED+12,'rifle','mine','rifle','mine')):null,
      turnOptimizer:wrappedFn?statsSummary(wrappedFn(turn,wait,DIAG_SEED+13,'rifle','mine','rifle','mine')):null
    };
    const rawSource=rawFn?String(rawFn):'';
    const report={
      timestamp:new Date().toISOString(),seed:DIAG_SEED,cpuClass:typeof cpuClass!=='undefined'?cpuClass:null,cpuLimit:typeof cpuChipLimit==='function'?cpuChipLimit():null,
      programHealth:{originalA:safeHealth(pa),trimmedA:safeHealth(ta),originalB:safeHealth(pb),trimmedB:safeHealth(tb)},
      rawCore:statsSummary(raw),rawCoreAfterCpuTrim:statsSummary(rawTrim),optimizerPath:statsSummary(wrapped),probes,
      executorMarkers:{hasDecisionAccumulator:rawSource.includes('decisionAcc'),hasExecCall:rawSource.includes("exec(side,side==='A'?pa:pb)"),hasVisitedAdd:rawSource.includes('visited.add')}
    };
    report.compare={raw_vs_trim:compareSummaries(report.rawCore,report.rawCoreAfterCpuTrim),trim_vs_optimizer:compareSummaries(report.rawCoreAfterCpuTrim,report.optimizerPath)};
    return report;
  }
  function renderReport(report){
    const h0=report.programHealth.originalA,h1=report.programHealth.trimmedA;
    const a=report.rawCore,b=report.rawCoreAfterCpuTrim,c=report.optimizerPath,p=report.probes;
    const fmt=x=>x?`攻${x.shoot+x.mine+x.killer}/与${x.damage}/移${x.move+x.evade}/旋${x.turn}/訪${x.visitedCount}`:'-';
    const ok1=report.compare.raw_vs_trim.equal,ok2=report.compare.trim_vs_optimizer.equal;
    const probeExec=(p.attackCore?.shoot||0)>0||(p.moveCore?.move||0)>0||(p.turnCore?.turn||0)>0;
    const parts=[
      `固定seed ${report.seed}`,
      `A経路 ${h0?.reachable??'-'}→CPU後${h1?.reachable??'-'}`,
      `手設計 Core ${fmt(a)}`,
      `CPU後 ${fmt(b)}`,
      `探索経路 ${fmt(c)}`,
      `強制射撃 ${fmt(p.attackCore)}`,
      `強制前進 ${fmt(p.moveCore)}`,
      `強制旋回 ${fmt(p.turnCore)}`,
      `実行器 ${probeExec?'動作':'停止疑い'}`,
      `marker acc:${report.executorMarkers.hasDecisionAccumulator?'有':'無'} exec:${report.executorMarkers.hasExecCall?'有':'無'} visit:${report.executorMarkers.hasVisitedAdd?'有':'無'}`,
      `Core→CPU ${ok1?'一致':'差異:'+report.compare.raw_vs_trim.diffs.join(',')}`,
      `CPU→探索 ${ok2?'一致':'差異:'+report.compare.trim_vs_optimizer.diffs.join(',')}`
    ];
    evoDetail.textContent=parts.join(' / ');
    if(!probeExec)statusEl.textContent='シミュレータ診断：条件分岐を使わない強制命令でも行動0です。コア実行ループ側の不具合を疑います。';
    else if(ok1&&ok2)statusEl.textContent='シミュレータ診断：実行器は動作し、Core/CPU/探索も一致しています。次は手設計プログラムのPC遷移を追跡します。';
    else statusEl.textContent='シミュレータ診断で層間差異を検出しました。探索は再実行せず、この差異を先に修正してください。';
  }
  function downloadReport(report){
    try{
      const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download=`robot-ai-simulator-diagnostic-${report.seed}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(_e){}
  }
  setTimeout(()=>{
    const section=optimizeBtn?.closest?.('.section');if(!section||root.querySelector('#simDiagBtn'))return;
    const btn=document.createElement('button');btn.type='button';btn.id='simDiagBtn';btn.textContent='シミュレータ診断';
    btn.addEventListener('click',()=>{try{const report=makeReport();window.__robotSimulatorDiagnostic=report;renderReport(report);downloadReport(report);}catch(err){console.error(err);statusEl.textContent='シミュレータ診断エラー：'+(err?.message||err);}});
    section.querySelector('.controls')?.appendChild(btn);
  },0);
})();
