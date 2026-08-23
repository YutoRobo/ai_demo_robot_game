// Fixed Champion Gate: keep a new optimized result only when it beats the saved champion on an immutable benchmark.
const _optimizeHybridCore=optimizeHybrid;
optimizeHybrid=async function(maxGenerations=1000){
  const previousRaw=(()=>{try{return localStorage.getItem(OPTIMIZER_STORAGE_KEY);}catch(_){return null;}})();
  let previous=null;
  try{previous=previousRaw?JSON.parse(previousRaw):null;}catch(_){previous=null;}

  await _optimizeHybridCore(maxGenerations);

  const weaponList=['rifle','burst','heavy','rapid','mine','killer'];
  const fixedOpponents=[
    {p:handDesignedChampion('A'),w1:'rifle',w2:'mine'},
    {p:handDesignedChampion('A'),w1:'heavy',w2:'rapid'},
    {p:handDesignedChampion('B'),w1:'burst',w2:'killer'},
    {p:strategicSeeds()[0],w1:'rapid',w2:'mine'},
    {p:strategicSeeds()[1],w1:'heavy',w2:'killer'},
    {p:strategicSeeds()[2],w1:'rifle',w2:'rapid'}
  ];
  const gateSeeds=Array.from({length:64},(_,i)=>1760000000+i*19001);

  function normalizeCandidate(p,w1,w2){
    return{p:cloneProgram(p),w1:weaponList.includes(w1)?w1:'rifle',w2:weaponList.includes(w2)?w2:'mine'};
  }
  function gateScore(v){
    let wins=0,draws=0,losses=0,margin=0,resolved=0;
    for(let i=0;i<gateSeeds.length;i++){
      const q=fixedOpponents[i%fixedOpponents.length],seed=gateSeeds[i];
      const r1=simulateBattleWeaponAware(v.p,q.p,seed,v.w1,v.w2,q.w1,q.w2);
      const r2=simulateBattleWeaponAware(q.p,v.p,seed,q.w1,q.w2,v.w1,v.w2);
      const pairs=[[r1,1],[r2,-1]];
      for(const [r,side] of pairs){
        const win=side===1?r.winner>0:r.winner<0;
        const loss=side===1?r.winner<0:r.winner>0;
        if(win)wins++;else if(loss)losses++;else draws++;
        if(r.resolved)resolved++;
        margin+=side===1?r.a-r.b:r.b-r.a;
      }
    }
    const games=gateSeeds.length*2,wr=wins/games,avgMargin=margin/games,resolvedRate=resolved/games;
    const margin01=(Math.max(-100,Math.min(100,avgMargin))+100)/200;
    const score=.95*wr+.04*margin01+.01*resolvedRate;
    return{score,wr,avgMargin,wins,draws,losses,games};
  }

  const candidate=normalizeCandidate(programs.A,weaponA1Sel.value,weaponA2Sel.value);
  const candGate=gateScore(candidate);
  let prevGate=null;
  if(previous?.programs?.A){
    prevGate=gateScore(normalizeCandidate(previous.programs.A,previous.weapons?.A1,previous.weapons?.A2));
  }

  const marginRequired=.0025;
  const accepted=!prevGate||candGate.score>prevGate.score+marginRequired;
  if(accepted){
    saveOptimizedResult({
      championGate:{accepted:true,score:candGate.score,winRate:candGate.wr,avgHpMargin:candGate.avgMargin,games:candGate.games,previousScore:prevGate?.score??null}
    });
    evoDetail.textContent+=` / Champion Gate ${(candGate.wr*100).toFixed(1)}% 採用`;
    statusEl.textContent=prevGate
      ?`高度探索完了。固定Champion Gateで前回王者を上回ったため、新Championを保存しました（${(prevGate.wr*100).toFixed(1)}% → ${(candGate.wr*100).toFixed(1)}%）。`
      :`高度探索完了。固定Champion Gateで初代Championとして保存しました（勝率 ${(candGate.wr*100).toFixed(1)}%）。`;
  }else{
    programs.A=cloneProgram(previous.programs.A);programs.B=cloneProgram(previous.programs.B);
    if(previous.weapons){
      weaponA1Sel.value=previous.weapons.A1||weaponA1Sel.value;weaponA2Sel.value=previous.weapons.A2||weaponA2Sel.value;
      weaponB1Sel.value=previous.weapons.B1||weaponB1Sel.value;weaponB2Sel.value=previous.weapons.B2||weaponB2Sel.value;
    }
    if(previousRaw){try{localStorage.setItem(OPTIMIZER_STORAGE_KEY,previousRaw);}catch(_){}}
    lastOptimized={A:cloneProgram(programs.A),B:cloneProgram(programs.B)};
    editSide='A';selectedCell=1;
    state={A:{pc:0,acc:0,flag:false,timer:0,lastSeen:0,lastHp:100,hitRecent:0,lockTime:0},B:{pc:0,acc:0,flag:false,timer:0,lastSeen:0,lastHp:100,hitRecent:0,lockTime:0}};
    renderProgram();
    evoDetail.textContent+=` / Champion Gate ${(candGate.wr*100).toFixed(1)}% 不採用・王者 ${(prevGate.wr*100).toFixed(1)}% 維持`;
    statusEl.textContent=`探索候補は固定Champion Gateで前回王者を上回れなかったため不採用です。保存済みChampionを維持しました（候補 ${(candGate.wr*100).toFixed(1)}% / 王者 ${(prevGate.wr*100).toFixed(1)}%）。`;
  }
};
