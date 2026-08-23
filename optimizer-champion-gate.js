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
  const candidateB=normalizeCandidate(programs.B,weaponB1Sel.value,weaponB2Sel.value);
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
      ?`高度探索完了。探索結果を盤面へ反映し、固定Champion Gateで前回王者を上回ったため新Championとして保存しました（${(prevGate.wr*100).toFixed(1)}% → ${(candGate.wr*100).toFixed(1)}%）。`
      :`高度探索完了。探索結果を盤面へ反映し、初代Championとして保存しました（勝率 ${(candGate.wr*100).toFixed(1)}%）。`;
  }else{
    // Keep the newly explored candidate visible/playable, but preserve the previous Champion in storage.
    if(previousRaw){try{localStorage.setItem(OPTIMIZER_STORAGE_KEY,previousRaw);}catch(_){}}
    programs.A=cloneProgram(candidate.p);programs.B=cloneProgram(candidateB.p);
    weaponA1Sel.value=candidate.w1;weaponA2Sel.value=candidate.w2;
    weaponB1Sel.value=candidateB.w1;weaponB2Sel.value=candidateB.w2;
    lastOptimized={A:cloneProgram(programs.A),B:cloneProgram(programs.B)};
    editSide='A';selectedCell=1;
    state={A:{pc:0,acc:0,flag:false,timer:0,lastSeen:0,lastHp:100,hitRecent:0,lockTime:0},B:{pc:0,acc:0,flag:false,timer:0,lastSeen:0,lastHp:100,hitRecent:0,lockTime:0}};
    renderProgram();
    evoDetail.textContent+=` / Champion Gate ${(candGate.wr*100).toFixed(1)}% 不採用・候補は盤面反映 / 王者 ${(prevGate.wr*100).toFixed(1)}% 保存維持`;
    statusEl.textContent=`探索結果を盤面へ反映しました。固定Champion Gateでは前回王者を上回れなかったため、保存Championだけ前回王者を維持します（候補 ${(candGate.wr*100).toFixed(1)}% / 王者 ${(prevGate.wr*100).toFixed(1)}%）。`;
  }
};

// Integrity layer installed after CPU/tactical wrappers. It makes the CPU-limited phenotype
// a connected executable graph and guarantees the optimizer evaluates exactly that phenotype.
setTimeout(()=>{
  function dirBetween(a,b){
    if(b===a-1&&Math.floor(a/6)===Math.floor(b/6))return'L';
    if(b===a+1&&Math.floor(a/6)===Math.floor(b/6))return'R';
    if(b===a-6)return'U';
    if(b===a+6)return'D';
    return null;
  }
  function compactFallback(limit){
    const p=Array(36).fill(null);
    p[1]={type:'enemyInWideFov',kind:'cond',yes:'D',no:'R'};
    p[2]={type:'turnR',kind:'action',next:'L'};
    p[7]={type:'enemyInMediumFov',kind:'cond',yes:'D',no:'R'};
    p[8]={type:'forward',kind:'action',next:'U'};
    p[13]={type:'aim',kind:'action',next:'R'};
    p[14]={type:'canShoot',kind:'cond',yes:'R',no:'U'};
    p[15]={type:'weapon1',kind:'action',next:'L'};
    if(limit>=8)p[9]={type:'strafeR',kind:'action',next:'L'};
    return p;
  }
  function integrityNormalizeProgram(p,limit=(typeof cpuChipLimit==='function'?cpuChipLimit():18)){
    limit=Math.max(4,Math.min(35,limit||18));
    const src=cloneProgram(p||Array(36).fill(null));
    for(let i=1;i<36;i++){
      const c=src[i];if(!c)continue;
      if(c.type==='shoot')c.type='weapon1';
      if(c.type==='mine'||c.type==='killerShot')c.type='weapon2';
      if(!chipTypes.some(x=>x[0]===c.type))src[i]=null;
    }
    if(!src[1])src[1]={type:'enemyInWideFov',kind:'cond',yes:'D',no:'R'};

    // First repair broken edges locally, before selecting the CPU-sized connected subgraph.
    for(let pass=0;pass<3;pass++){
      for(let i=1;i<36;i++){
        const c=src[i];if(!c)continue;
        const fields=c.kind==='action'?['next']:['yes','no'];
        for(const f of fields){
          const j=nextCell(i,c[f]);
          if(j!==i&&src[j])continue;
          const opts=[];
          for(const [d] of dirs){const k=nextCell(i,d);if(k!==i&&(k===0||src[k]))opts.push(d);}
          if(opts.length)c[f]=opts[0];
        }
      }
    }

    const selected=[],selectedSet=new Set(),parent=new Map(),seen=new Set([0]),q=[0];
    while(q.length&&selected.length<limit){
      const i=q.shift(),c=i===0?{kind:'action',next:'R'}:src[i];if(!c)continue;
      const fields=c.kind==='action'?['next']:['yes','no'];
      for(const f of fields){
        const j=nextCell(i,c[f]);
        if(j<=0||j>=36||seen.has(j)||!src[j])continue;
        seen.add(j);parent.set(j,i);q.push(j);selected.push(j);selectedSet.add(j);
        if(selected.length>=limit)break;
      }
    }
    if(selected.length<4)return compactFallback(limit);

    const n=Array(36).fill(null);
    for(const i of selected)n[i]={...src[i]};
    const chooseReturnDir=i=>{
      const par=parent.get(i);
      if(par===0&&i===1)return'L';
      if(par!=null){const d=dirBetween(i,par);if(d)return d;}
      for(const j of selected){const d=dirBetween(i,j);if(d)return d;}
      if(i===1)return'L';
      return'U';
    };
    for(const i of selected){
      const c=n[i],fields=c.kind==='action'?['next']:['yes','no'];
      for(const f of fields){
        const j=nextCell(i,c[f]);
        if(j===0||selectedSet.has(j))continue;
        c[f]=chooseReturnDir(i);
      }
    }

    const reachable=()=>{const s=new Set([0]),qq=[0];while(qq.length){const i=qq.shift(),c=i===0?{kind:'action',next:'R'}:n[i];if(!c)continue;const fs=c.kind==='action'?['next']:['yes','no'];for(const f of fs){const j=nextCell(i,c[f]);if(j>=0&&j<36&&!s.has(j)){s.add(j);qq.push(j);}}}return s;};
    let reach=reachable();
    const r=[...reach].filter(i=>i>0&&n[i]);
    if(r.length<4)return compactFallback(limit);
    if(!r.some(i=>['weapon1','weapon2'].includes(n[i].type))){
      const pos=r.slice().reverse().find(i=>i!==1)||r[r.length-1];
      n[pos]={type:'weapon1',kind:'action',next:chooseReturnDir(pos)};
    }
    if(!r.some(i=>['forward','back','strafeL','strafeR','evade'].includes(n[i].type))){
      const pos=r.slice().reverse().find(i=>i!==1&&!['weapon1','weapon2'].includes(n[i].type));
      if(pos)n[pos]={type:'forward',kind:'action',next:chooseReturnDir(pos)};
    }
    return n;
  }

  // Replace the destructive CPU trimmer globally so editor changes and final installation use the same phenotype.
  try{trimProgramToCpu=integrityNormalizeProgram;}catch(_){ }
  try{applyCpuLimitAll=function(){programs.A=integrityNormalizeProgram(programs.A);programs.B=integrityNormalizeProgram(programs.B);};}catch(_){ }

  // Rebuild the simulator from the original pre-CPU function, then add tactical conditions and combat validity.
  let raw=null;
  try{raw=(typeof baseSimCpu==='function'?baseSimCpu:null);}catch(_){raw=null;}
  if(!raw)raw=simulateBattleWeaponAware;
  let src=raw.toString();
  const marker="if(c==='enemyRight')return v.visible&&v.signed>0;";
  const extra=`if(c==='enemyFacingMe'){const e=op(side),a=Math.abs(nrm(Math.atan2(m.y-e.y,m.x-e.x)-e.ang));return v.visible&&a<=20*Math.PI/180;}if(c==='behindEnemy'){const e=op(side),a=Math.abs(nrm(Math.atan2(m.y-e.y,m.x-e.x)-e.ang));return v.visible&&a>=135*Math.PI/180;}if(c==='enemyWithin100')return v.visible&&v.dd<=100;if(c==='enemyWithin200')return v.visible&&v.dd<=200;if(c==='enemyWithin300')return v.visible&&v.dd<=300;if(c==='weapon1Ammo'){const w=profiles[side][0];return w==='mine'?m.mineStock>0:w==='killer'?m.killerReady:!!(m.ammo&&m.ammo[w]>0);}if(c==='weapon2Ammo'){const w=profiles[side][1];return w==='mine'?m.mineStock>0:w==='killer'?m.killerReady:!!(m.ammo&&m.ammo[w]>0);}`;
  if(src.includes(marker))src=src.replace(marker,marker+extra);
  let baseFixed=raw;
  try{baseFixed=eval('('+src+')');}catch(err){console.error('optimizer integrity simulator rebuild failed',err);}

  simulateBattleWeaponAware=function(pa,pb,seed,a1,a2,b1,b2){
    const na=integrityNormalizeProgram(pa),nb=integrityNormalizeProgram(pb);
    const r=baseFixed(na,nb,seed,a1,a2,b1,b2);
    if(!r||!r.stats)return r;
    const combat=st=>{
      const attacks=(st.shoot||0)+(st.mine||0)+(st.killer||0),damage=st.damage||0;
      const translation=(st.move||0)+(st.evade||0),orientation=(st.turn||0)+(st.aim||0);
      return{attacks,damage,translation,orientation,nonCombat:attacks===0&&damage===0,weakCombat:damage===0&&attacks<2};
    };
    const aa=combat(r.stats.A),bb=combat(r.stats.B);r.activity={A:aa,B:bb};
    if(aa.nonCombat&&!bb.nonCombat){r.a=0;r.b=Math.max(1,r.b);r.winner=-1;r.resolved=true;}
    else if(bb.nonCombat&&!aa.nonCombat){r.b=0;r.a=Math.max(1,r.a);r.winner=1;r.resolved=true;}
    else if(aa.nonCombat&&bb.nonCombat){r.winner=0;r.resolved=false;}
    else if(aa.weakCombat&&!bb.weakCombat&&aa.damage===0&&bb.damage===0){r.a=0;r.b=Math.max(1,r.b);r.winner=-1;r.resolved=true;}
    else if(bb.weakCombat&&!aa.weakCombat&&aa.damage===0&&bb.damage===0){r.b=0;r.a=Math.max(1,r.a);r.winner=1;r.resolved=true;}
    return r;
  };
  simulateBattleWeaponAware.__integrityFixed=true;

  function fixedAudit(){
    const opps=[
      {p:handDesignedChampion('A'),w1:'rifle',w2:'mine'},
      {p:handDesignedChampion('A'),w1:'heavy',w2:'rapid'},
      {p:handDesignedChampion('B'),w1:'burst',w2:'killer'},
      {p:strategicSeeds()[0],w1:'rapid',w2:'mine'}
    ];
    let games=0,wins=0,resolved=0,attacks=0,damage=0,move=0;
    const cand={p:integrityNormalizeProgram(programs.A),w1:weaponA1Sel.value,w2:weaponA2Sel.value};
    for(let i=0;i<12;i++){
      const q=opps[i%opps.length],seed=1990000000+i*31013;
      for(const [r,side] of [[simulateBattleWeaponAware(cand.p,q.p,seed,cand.w1,cand.w2,q.w1,q.w2),'A'],[simulateBattleWeaponAware(q.p,cand.p,seed,q.w1,q.w2,cand.w1,cand.w2),'B']]){
        games++;if(side==='A'?(r.winner>0):(r.winner<0))wins++;if(r.resolved)resolved++;
        const ac=r.activity?.[side]||{};attacks+=ac.attacks||0;damage+=ac.damage||0;move+=ac.translation||0;
      }
    }
    return{games,winRate:wins/games,resolvedRate:resolved/games,attacks:attacks/games,damage:damage/games,move:move/games};
  }

  const previousOptimize=optimizeHybrid;
  optimizeHybrid=async function(...args){
    const r=await previousOptimize(...args);
    programs.A=integrityNormalizeProgram(programs.A);programs.B=integrityNormalizeProgram(programs.B);
    lastOptimized={A:cloneProgram(programs.A),B:cloneProgram(programs.B)};renderProgram();
    const m=fixedAudit(),pct=x=>(100*x).toFixed(1)+'%';
    evoDetail.textContent+=` / 固定監査${m.games}戦: 勝率 ${pct(m.winRate)}・決着率 ${pct(m.resolvedRate)}・平均攻撃 ${m.attacks.toFixed(1)}・平均与ダメ ${m.damage.toFixed(1)}・平均移動/回避 ${m.move.toFixed(1)}`;
    statusEl.textContent=`探索完了。CPU制限後の実個体を固定ベースラインで監査：勝率 ${pct(m.winRate)}、決着率 ${pct(m.resolvedRate)}、平均攻撃 ${m.attacks.toFixed(1)}回、平均与ダメ ${m.damage.toFixed(1)}。1試合最大180秒です。`;
    try{
      const rawSaved=localStorage.getItem(OPTIMIZER_STORAGE_KEY),saved=rawSaved?JSON.parse(rawSaved):{};
      saved.version=1;saved.savedAt=new Date().toISOString();saved.programs={A:cloneProgram(programs.A),B:cloneProgram(programs.B)};
      saved.weapons={A1:weaponA1Sel.value,A2:weaponA2Sel.value,B1:weaponB1Sel.value,B2:weaponB2Sel.value};
      saved.metrics={gen:evoGen.textContent,battles:evoBattles.textContent,best:evoBest.textContent,detail:evoDetail.textContent};
      saved.integrityAudit=m;saved.cpuClass=typeof cpuClass!=='undefined'?cpuClass:saved.cpuClass;saved.cpuLimit=typeof cpuChipLimit==='function'?cpuChipLimit():saved.cpuLimit;
      localStorage.setItem(OPTIMIZER_STORAGE_KEY,JSON.stringify(saved));
    }catch(err){console.warn('integrity result persist failed',err);}
    return r;
  };
},0);
