// Legacy Champion Gate intentionally disabled.
// The behavior-cluster optimizer selects by Validation and uses Test only for final reporting.
// This wrapper only makes the heavy 300-population bootstrap visibly start immediately.
const __optimizerWithBootstrapUi=optimizeHybrid;
optimizeHybrid=async function(maxGenerations=1000){
  const baseSim=simulateBattleWeaponAware;
  let simCalls=0;
  simulateBattleWeaponAware=function(...args){
    const r=baseSim(...args);
    simCalls++;
    if(simCalls<=3600&&simCalls%24===0){
      evoGen.textContent='初期評価';
      evoBattles.textContent=String(simCalls);
      evoProgress.style.width=Math.min(8,simCalls/3600*8).toFixed(1)+'%';
      evoDetail.textContent=`300個体の初期評価中… ${Math.min(300,Math.ceil(simCalls/12))}/300個体（${simCalls}戦シミュレーション）`;
    }
    return r;
  };
  try{
    running=false;
    optimizeBtn.disabled=true;
    statusEl.textContent='探索を開始しました。まず300個体の初期評価を行っています。';
    evoGen.textContent='初期評価 0/300';
    evoBattles.textContent='0';
    evoBest.textContent='-';
    evoProgress.style.width='0.5%';
    evoDetail.textContent='初期集団を生成中…';
    await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
    return await __optimizerWithBootstrapUi(maxGenerations);
  }finally{
    simulateBattleWeaponAware=baseSim;
  }
};
