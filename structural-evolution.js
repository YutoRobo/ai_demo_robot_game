// Grid-native structural evolution prototype.
// This file is intentionally isolated from optimizeHybrid. It provides operator-level
// validation and a UI test button, but does not change the production optimizer yet.
(function installStructuralEvolutionPrototype(){
  const VERSION='grid-native-structure-v0.1';
  const cfg={
    minReachable:6,
    requiredFunctions:['sensor','orientation','movement','weapon'],
    retryLimit:5,
    mutationProbability:.80,
    crossoverProbability:.20,
    localRedirectDepth:3,
    operatorWeights:{
      replaceAction:.20,
      replaceCondition:.15,
      insertConditionBranch:.20,
      extendBranch:.15,
      redirectEdge:.05,
      shrinkBranch:.10,
      weaponMutation:.15
    }
  };

  const actionGroups={
    translation:['forward','back','strafeL','strafeR'],
    evasion:['evade'],
    orientation:['aim','turnL','turnR'],
    attack:['weapon1','weapon2'],
    state:['flagOn','flagOff','timerStart','wait']
  };
  const conditionGroups={
    detection:['enemyInNarrowFov','enemyInMediumFov','enemyInWideFov'],
    geometry:['enemyFront','enemyLeft','enemyRight','enemyFacingMe','behindEnemy'],
    distance:['enemyNear','enemyFar','enemyWithin100','enemyWithin200','enemyWithin300'],
    threat:['bulletNear','bulletLeft','bulletRight','hitRecent'],
    selfState:['hpLow','flagSet','timer2s'],
    environment:['wallNear','lostEnemy'],
    attackState:['canShoot','weapon1Ammo','weapon2Ammo']
  };
  const sensorTypes=new Set(Object.values(conditionGroups).flat());
  const orientationTypes=new Set(actionGroups.orientation);
  const movementTypes=new Set([...actionGroups.translation,...actionGroups.evasion]);
  const weaponTypes=new Set(actionGroups.attack);

  function clone(p){return cloneProgram(p);}
  function dirBetween(a,b){
    const ax=a%6,ay=Math.floor(a/6),bx=b%6,by=Math.floor(b/6);
    if(ax===bx&&by===ay-1)return'U';if(ax===bx&&by===ay+1)return'D';
    if(ay===by&&bx===ax-1)return'L';if(ay===by&&bx===ax+1)return'R';return null;
  }
  function occupiedNeighbors(p,i){const out=[];for(const [d] of dirs){const j=nextCell(i,d);if(j!==i&&j>0&&p[j])out.push({dir:d,index:j});}return out;}
  function emptyNeighbors(p,i){const out=[];for(const [d] of dirs){const j=nextCell(i,d);if(j!==i&&j>0&&!p[j])out.push({dir:d,index:j});}return out;}
  function reachable(p){
    const seen=new Set([0]),q=[0];
    while(q.length){const i=q.shift(),c=i===0?{kind:'action',next:'R'}:p[i];if(!c)continue;const ns=c.kind==='action'?[nextCell(i,c.next)]:[nextCell(i,c.yes),nextCell(i,c.no)];for(const j of ns){if(j===0){seen.add(0);continue;}if(j>0&&j<36&&j!==i&&p[j]&&!seen.has(j)){seen.add(j);q.push(j);}}}
    return seen;
  }
  function incoming(p,target){const out=[];for(let i=1;i<36;i++){const c=p[i];if(!c)continue;for(const f of c.kind==='action'?['next']:['yes','no'])if(nextCell(i,c[f])===target)out.push({index:i,field:f});}if(target===1)out.push({index:0,field:'next'});return out;}
  function pruneUnreachable(p){const n=clone(p),r=reachable(n);for(let i=1;i<36;i++)if(n[i]&&!r.has(i))n[i]=null;return n;}
  function chipCount(p){let n=0;for(let i=1;i<36;i++)if(p[i])n++;return n;}
  function structureHealth(p){
    const r=reachable(p),ids=[...r].filter(i=>i>0&&p[i]),types=ids.map(i=>p[i].type),broken=[];
    for(const i of ids){const c=p[i];for(const f of c.kind==='action'?['next']:['yes','no']){const j=nextCell(i,c[f]);if(j===i||(j!==0&&!p[j]))broken.push({index:i,field:f});}}
    const functions={sensor:types.some(t=>sensorTypes.has(t)),orientation:types.some(t=>orientationTypes.has(t)),movement:types.some(t=>movementTypes.has(t)),weapon:types.some(t=>weaponTypes.has(t))};
    const limit=typeof cpuChipLimit==='function'?cpuChipLimit():18;
    const valid=ids.length>=cfg.minReachable&&cfg.requiredFunctions.every(k=>functions[k])&&broken.length===0&&chipCount(p)<=limit;
    return{valid,reachable:ids.length,filled:chipCount(p),limit,functions,broken:broken.length};
  }
  function actionGroup(type){for(const [k,v] of Object.entries(actionGroups))if(v.includes(type))return v;return null;}
  function conditionGroup(type){for(const [k,v] of Object.entries(conditionGroups))if(v.includes(type))return v;return null;}
  function pick(a,rng=Math.random){return a.length?a[Math.floor(rng()*a.length)]:null;}

  function replaceAction(p,rng=Math.random){const n=clone(p),r=[...reachable(n)].filter(i=>i>0&&n[i]?.kind==='action'),i=pick(r,rng);if(i==null)return null;const group=actionGroup(n[i].type);if(!group||group.length<2)return null;const candidates=group.filter(x=>x!==n[i].type&&chipTypes.some(z=>z[0]===x));const type=pick(candidates,rng);if(!type)return null;n[i]={...n[i],type};return{program:n,detail:{index:i,type}};}
  function replaceCondition(p,rng=Math.random){const n=clone(p),r=[...reachable(n)].filter(i=>i>0&&n[i]?.kind==='cond'),i=pick(r,rng);if(i==null)return null;const group=conditionGroup(n[i].type);if(!group||group.length<2)return null;const candidates=group.filter(x=>x!==n[i].type&&chipTypes.some(z=>z[0]===x));const type=pick(candidates,rng);if(!type)return null;n[i]={...n[i],type};return{program:n,detail:{index:i,type}};}

  // Grid fact: on a 4-neighbour square grid an A->B edge has no third cell adjacent to both A and B.
  // Therefore a literal one-cell edge split is impossible without relocation. Instead growth is performed
  // by adding a branch-local node, which is always grid-realizable when an empty neighbour exists.
  function extendBranch(p,rng=Math.random,forcedAction=null){
    const n=clone(p),conds=[...reachable(n)].filter(i=>i>0&&n[i]?.kind==='cond'&&emptyNeighbors(n,i).length),i=pick(conds,rng);if(i==null)return null;
    const empty=pick(emptyNeighbors(n,i),rng),c=n[i],field=rng()<.5?'yes':'no';
    const oldDest=nextCell(i,c[field]);
    let type=forcedAction||pick([...actionGroups.translation,...actionGroups.evasion,...actionGroups.orientation,...actionGroups.attack].filter(t=>chipTypes.some(z=>z[0]===t)),rng);
    if(!type)return null;
    n[empty.index]={type,kind:'action',next:dirBetween(empty.index,i)||'L'};
    c[field]=empty.dir;
    return{program:n,detail:{condition:i,branch:field,added:empty.index,type,oldDest}};
  }

  // Converts an existing action into a condition and moves the old action into an adjacent empty branch.
  // One branch preserves the old continuation; the other executes the old action and loops back to the condition.
  // This grows the reachable graph by one while keeping the previous action available.
  function insertConditionBranch(p,rng=Math.random,forcedCondition=null,forcedAction=null){
    const n=clone(p),acts=[...reachable(n)].filter(i=>i>0&&n[i]?.kind==='action'&&emptyNeighbors(n,i).length),i=pick(acts,rng);if(i==null)return null;
    const old={...n[i]},oldDest=nextCell(i,old.next);if(oldDest===i||oldDest<0||oldDest>=36||(!n[oldDest]&&oldDest!==0))return null;
    const empty=pick(emptyNeighbors(n,i),rng);
    const condCandidates=Object.values(conditionGroups).flat().filter(t=>chipTypes.some(z=>z[0]===t));
    const condType=forcedCondition||pick(condCandidates,rng),actionType=forcedAction||old.type;if(!condType)return null;
    n[i]={type:condType,kind:'cond',yes:empty.dir,no:old.next};
    n[empty.index]={type:actionType,kind:'action',next:dirBetween(empty.index,i)||'L'};
    return{program:n,detail:{replacedAction:i,condition:condType,branchAction:empty.index,actionType,oldDest}};
  }

  function redirectEdge(p,rng=Math.random){
    const n=clone(p),ids=[...reachable(n)].filter(i=>i>0&&n[i]&&occupiedNeighbors(n,i).length>=2),i=pick(ids,rng);if(i==null)return null;const c=n[i],field=c.kind==='action'?'next':(rng()<.5?'yes':'no'),cur=nextCell(i,c[field]);const candidates=occupiedNeighbors(n,i).filter(x=>x.index!==cur);const q=pick(candidates,rng);if(!q)return null;c[field]=q.dir;return{program:n,detail:{index:i,field,to:q.index}};
  }

  // Shrinks a branch-local leaf/action loop created by extend/insert operators.
  function shrinkBranch(p,rng=Math.random){
    const n=clone(p),candidates=[];for(const i of [...reachable(n)]){if(i<=0||n[i]?.kind!=='cond')continue;for(const field of ['yes','no']){const j=nextCell(i,n[i][field]),a=n[j];if(j>0&&a?.kind==='action'&&nextCell(j,a.next)===i&&incoming(n,j).length===1)candidates.push({i,field,j,other:field==='yes'?'no':'yes'});}}
    const x=pick(candidates,rng);if(!x)return null;n[x.i][x.field]=n[x.i][x.other];n[x.j]=null;return{program:pruneUnreachable(n),detail:{condition:x.i,removed:x.j,branch:x.field}};
  }
  function weaponMutation(p,rng=Math.random){const n=clone(p),ids=[...reachable(n)].filter(i=>i>0&&weaponTypes.has(n[i]?.type)),i=pick(ids,rng);if(i==null)return null;n[i]={...n[i],type:n[i].type==='weapon1'?'weapon2':'weapon1'};return{program:n,detail:{index:i,type:n[i].type}};}

  const operators={replaceAction,replaceCondition,insertConditionBranch,extendBranch,redirectEdge,shrinkBranch,weaponMutation};
  function weightedOperator(rng=Math.random){let x=rng(),sum=0;for(const [name,w] of Object.entries(cfg.operatorWeights)){sum+=w;if(x<=sum)return name;}return'insertConditionBranch';}
  function mutateStructured(p,rng=Math.random){for(let k=0;k<cfg.retryLimit;k++){const name=weightedOperator(rng),r=operators[name](p,rng);if(!r)continue;const q=pruneUnreachable(r.program),h=structureHealth(q);if(h.valid)return{program:q,operator:name,retries:k,detail:r.detail,health:h};}return{program:clone(p),operator:'parentCopy',retries:cfg.retryLimit,detail:{},health:structureHealth(p)};}

  function extractMotifs(p){const out=[];for(const i of [...reachable(p)]){if(i<=0||p[i]?.kind!=='cond')continue;for(const field of ['yes','no']){const j=nextCell(i,p[i][field]),a=p[j];if(j>0&&a?.kind==='action'&&nextCell(j,a.next)===i)out.push({conditionType:p[i].type,actionType:a.type,size:2,sourceCondition:i,sourceAction:j});}}return out;}
  function crossoverSubgraph(recipient,donor,rng=Math.random){const motifs=extractMotifs(donor);if(!motifs.length)return null;for(let k=0;k<cfg.retryLimit;k++){const m=pick(motifs,rng),r=insertConditionBranch(recipient,rng,m.conditionType,m.actionType);if(!r)continue;const q=pruneUnreachable(r.program),h=structureHealth(q);if(h.valid)return{program:q,operator:'subgraphCrossover',retries:k,detail:{motif:m,...r.detail},health:h};}return null;}

  function validSeed(){
    const candidates=[handDesignedChampion('A'),handDesignedChampion('B'),...(typeof strategicSeeds==='function'?strategicSeeds():[])];
    for(const p0 of candidates){const p=typeof trimProgramToCpu==='function'?trimProgramToCpu(p0):clone(p0),h=structureHealth(p);if(h.valid)return p;}
    return typeof trimProgramToCpu==='function'?trimProgramToCpu(handDesignedChampion('A')):handDesignedChampion('A');
  }
  function runOperatorTrials(trials=250){
    const seed=validSeed(),names=Object.keys(operators),rows={};for(const n of names)rows[n]={attempts:0,generated:0,valid:0,chipDelta:0};
    for(const name of names){for(let t=0;t<trials;t++){rows[name].attempts++;const r=operators[name](seed);if(!r)continue;rows[name].generated++;const q=pruneUnreachable(r.program),h=structureHealth(q);if(h.valid)rows[name].valid++;rows[name].chipDelta+=chipCount(q)-chipCount(seed);}}
    return{name:'operatorTrials',trials,seedHealth:structureHealth(seed),operators:rows};
  }
  function runGrowthShrinkTest(steps=80){
    let p=validSeed(),max=chipCount(p),min=max,growAccepted=0,shrinkAccepted=0;const start=max,limit=typeof cpuChipLimit==='function'?cpuChipLimit():18;
    for(let i=0;i<steps;i++){const grow=i<Math.floor(steps*.6);let r=grow?(Math.random()<.55?insertConditionBranch(p):extendBranch(p)):shrinkBranch(p);if(!r)continue;const q=pruneUnreachable(r.program),h=structureHealth(q);if(!h.valid)continue;p=q;if(grow)growAccepted++;else shrinkAccepted++;max=Math.max(max,chipCount(p));min=Math.min(min,chipCount(p));}
    return{name:'growthShrink',start,max,min,end:chipCount(p),limit,growAccepted,shrinkAccepted,finalHealth:structureHealth(p)};
  }
  function runCrossoverTrials(trials=250){
    const a=validSeed(),rawB=typeof trimProgramToCpu==='function'?trimProgramToCpu(handDesignedChampion('B')):handDesignedChampion('B'),b=structureHealth(rawB).valid?rawB:a;let generated=0,valid=0,mixed=0;for(let i=0;i<trials;i++){const r=crossoverSubgraph(a,b);if(!r)continue;generated++;if(r.health.valid)valid++;if(r.detail?.motif?.conditionType&&r.detail?.motif?.actionType)mixed++;}return{name:'crossoverTrials',trials,donorMotifs:extractMotifs(b).length,generated,valid,mixed};
  }
  function runSuite(){const report={version:VERSION,cpuLimit:typeof cpuChipLimit==='function'?cpuChipLimit():18,config:JSON.parse(JSON.stringify(cfg)),operator:runOperatorTrials(200),growth:runGrowthShrinkTest(100),crossover:runCrossoverTrials(200),timestamp:new Date().toISOString()};window.__structuralEvolutionReport=report;return report;}
  function renderReport(r){const ops=Object.entries(r.operator.operators).map(([k,v])=>`${k}:${v.valid}/${v.attempts}`).join(' / '),g=r.growth,c=r.crossover;const pass=r.operator.seedHealth.valid&&Object.values(r.operator.operators).some(v=>v.valid>0)&&g.finalHealth.valid&&c.valid>0;evoDetail.textContent=`構造進化単体試験 ${pass?'PASS':'要確認'} / CPU上限${r.cpuLimit} / 演算子 valid/試行 ${ops} / 成長 ${g.start}→max${g.max}→${g.end} / 交叉 valid ${c.valid}/${c.trials}`;statusEl.textContent=pass?'構造進化エンジン単体試験PASS。まだ本番探索には接続していません。':'構造進化エンジン単体試験で未成立項目があります。レポートを確認してください。';}

  setTimeout(()=>{const section=optimizeBtn?.closest?.('.section');if(!section||root.querySelector('#structureTestBtn'))return;const b=document.createElement('button');b.type='button';b.id='structureTestBtn';b.textContent='構造進化テスト';b.addEventListener('click',()=>{try{const r=runSuite();renderReport(r);console.info('structural evolution report',r);}catch(err){console.error(err);statusEl.textContent='構造進化テストエラー：'+(err?.message||err);}});section.querySelector('.controls')?.appendChild(b);},0);

  window.__structuralEvolution={VERSION,cfg,structureHealth,pruneUnreachable,mutateStructured,crossoverSubgraph,runSuite};
})();
