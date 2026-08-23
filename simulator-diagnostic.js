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
    const report={
      timestamp:new Date().toISOString(),seed:DIAG_SEED,cpuClass:typeof cpuClass!=='undefined'?cpuClass:null,cpuLimit:typeof cpuChipLimit==='function'?cpuChipLimit():null,
      programHealth:{originalA:safeHealth(pa),trimmedA:safeHealth(ta),originalB:safeHealth(pb),trimmedB:safeHealth(tb)},
      rawCore:statsSummary(raw),rawCoreAfterCpuTrim:statsSummary(rawTrim),optimizerPath:statsSummary(wrapped)
    };
    report.compare={raw_vs_trim:compareSummaries(report.rawCore,report.rawCoreAfterCpuTrim),trim_vs_optimizer:compareSummaries(report.rawCoreAfterCpuTrim,report.optimizerPath)};
    return report;
  }
  function renderReport(report){
    const h0=report.programHealth.originalA,h1=report.programHealth.trimmedA;
    const a=report.rawCore,b=report.rawCoreAfterCpuTrim,c=report.optimizerPath;
    const fmt=x=>`攻${x.shoot+x.mine+x.killer}/与${x.damage}/移${x.move+x.evade}/訪${x.visitedCount}`;
    const ok1=report.compare.raw_vs_trim.equal,ok2=report.compare.trim_vs_optimizer.equal;
    const parts=[
      `固定seed ${report.seed}`,
      `A経路 ${h0?.reachable??'-'}→CPU後${h1?.reachable??'-'}`,
      `Core ${fmt(a)}`,
      `CPU後 ${fmt(b)}`,
      `探索経路 ${fmt(c)}`,
      `Core→CPU ${ok1?'一致':'差異:'+report.compare.raw_vs_trim.diffs.join(',')}`,
      `CPU→探索 ${ok2?'一致':'差異:'+report.compare.trim_vs_optimizer.diffs.join(',')}`
    ];
    evoDetail.textContent=parts.join(' / ');
    statusEl.textContent=(ok1&&ok2)
      ?'シミュレータ診断：固定条件では主要統計が一致しました。次は実行PC列まで確認します。'
      :'シミュレータ診断で差異を検出しました。探索は再実行せず、この差異を先に修正してください。';
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
