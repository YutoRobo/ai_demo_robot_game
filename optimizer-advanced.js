// Advanced optimizer loaded by index.html with direct eval inside the game closure.
// It intentionally relies on the game-core lexical helpers/variables.
optimizeHybrid = async function(maxGenerations=1000){
  running=false;startBtn.textContent='戦闘開始';optimizeBtn.disabled=true;
  statusEl.textContent='高度進化探索：Train / Validation / Baseline / Test 分離で探索中…';
  evoProgress.style.width='0%';evoBattles.textContent='0';evoBest.textContent='-';
  const weaponList=['rifle','burst','heavy','rapid','mine','killer'];
  const weaponName={rifle:'ライフル',burst:'バースト',heavy:'ヘビー弾',rapid:'速射砲',mine:'地雷',killer:'強化弾'};
  const ITER=Math.max(20,Math.min(20000,Math.floor(maxGenerations||1000)));
  const POP=32,ELITE=8,QUICK=6,VAL=18,FINAL=80;
  let battleCount=0;
  const archive=new Map(),hall=[];

  function sanitize(p){
    const n=cloneProgram(p);
    for(let i=1;i<36;i++){
      const c=n[i];if(!c)continue;
      if(c.type==='shoot')c.type='weapon1';
      if(c.type==='mine'||c.type==='killerShot')c.type='weapon2';
      if(!chipTypes.some(x=>x[0]===c.type))n[i]=randomChip();
    }
    if(!n[1])n[1]={type:'enemyInWideFov',kind:'cond',yes:'D',no:'R'};
    return n;
  }
  function cfg(p,w1,w2){return{p:sanitize(p),w1,w2};}
  function sig(v){return v.w1+'|'+v.w2+'|'+JSON.stringify(v.p);}
  function sim(a,b,seed){return simulateBattleWeaponAware(a.p,b.p,seed,a.w1,a.w2,b.w1,b.w2);}
  function reachable(p){
    const seen=new Set([0]),q=[0];
    while(q.length){
      const i=q.shift(),c=i===0?{kind:'action',next:'R'}:p[i];if(!c)continue;
      const ns=c.kind==='action'?[nextCell(i,c.next)]:[nextCell(i,c.yes),nextCell(i,c.no)];
      for(const j of ns)if(j!==i&&j>=0&&j<36&&!seen.has(j)){seen.add(j);q.push(j);}
    }
    return seen;
  }
  function repair(p){
    const n=sanitize(p);let reach=reachable(n);
    for(let pass=0;pass<3;pass++){
      for(const i of [...reach]){
        if(i===0||!n[i])continue;
        const c=n[i],fields=c.kind==='action'?['next']:['yes','no'];
        for(const f of fields){
          const dest=nextCell(i,c[f]);
          if(dest===i||!n[dest]){
            const opts=[];
            for(const [d] of dirs){const j=nextCell(i,d);if(j!==i&&n[j])opts.push(d);}
            if(opts.length)c[f]=opts[Math.floor(Math.random()*opts.length)];
          }
        }
      }
      reach=reachable(n);
    }
    const r=[...reach].filter(i=>i>0&&n[i]);
    if(!r.some(i=>n[i].type==='weapon1'||n[i].type==='weapon2')){
      const pos=r.length?r[r.length-1]:1;n[pos]={type:'weapon1',kind:'action',next:'L'};
    }
    return n;
  }
  function descriptor(v){
    const r=[...reachable(v.p)].filter(i=>i>0&&v.p[i]);
    let cond=0,move=0,sensor=0,weap=0,stateUse=0;
    for(const i of r){
      const t=v.p[i].type,k=v.p[i].kind;if(k==='cond')cond++;
      if(['forward','back','strafeL','strafeR','turnL','turnR','evade'].includes(t))move++;
      if(['enemyFront','enemyNear','enemyFar','enemyLeft','enemyRight','enemyInNarrowFov','enemyInMediumFov','enemyInWideFov','bulletNear','bulletLeft','bulletRight','lostEnemy'].includes(t))sensor++;
      if(t==='weapon1'||t==='weapon2')weap++;
      if(['flagOn','flagOff','flagSet','timerStart','timer2s'].includes(t))stateUse++;
    }
    const bin=(x,a,b)=>x<a?0:x<b?1:2;
    return [bin(r.length,8,15),bin(cond,3,7),bin(move,3,7),bin(sensor,2,6),Math.min(2,weap),Math.min(1,stateUse),v.w1,v.w2].join('-');
  }
  function neighbors(p){
    const out=[];for(let i=1;i<36;i++)if(p[i])for(const [d] of dirs){const j=nextCell(i,d);if(j!==i&&!p[j])out.push(j);}return out;
  }
  function mutate(v){
    const n=cfg(v.p,v.w1,v.w2),p=repair(n.p),r=Math.random();
    if(r<.07)n.w1=weaponList[Math.floor(Math.random()*weaponList.length)];
    else if(r<.14)n.w2=weaponList[Math.floor(Math.random()*weaponList.length)];
    else{
      const reach=[...reachable(p)].filter(i=>i>0&&p[i]),x=Math.random();
      if(x<.28&&reach.length){
        const pos=reach[Math.floor(Math.random()*reach.length)],old=p[pos];
        const same=chipTypes.filter(z=>z[2]===old.kind&&z[0]!==old.type);
        if(same.length)p[pos]={...old,type:same[Math.floor(Math.random()*same.length)][0]};
      }else if(x<.52&&reach.length){
        const pos=reach[Math.floor(Math.random()*reach.length)],c=p[pos],opts=[];
        for(const [d] of dirs){const j=nextCell(pos,d);if(j!==pos&&p[j])opts.push(d);}
        if(opts.length){if(c.kind==='action')c.next=opts[Math.floor(Math.random()*opts.length)];else if(Math.random()<.5)c.yes=opts[Math.floor(Math.random()*opts.length)];else c.no=opts[Math.floor(Math.random()*opts.length)];}
      }else if(x<.72){
        const ns=neighbors(p);if(ns.length)p[ns[Math.floor(Math.random()*ns.length)]]=randomChip();
      }else if(x<.84&&reach.length>7){
        const pos=reach[Math.floor(Math.random()*reach.length)];if(pos!==1)p[pos]=null;
      }else{
        // tactical mini-module mutation around a reachable anchor
        const anchor=reach.length?reach[Math.floor(Math.random()*reach.length)]:1;
        const ax=anchor%6,ay=Math.floor(anchor/6);
        const module=[
          {dx:0,dy:0,c:{type:'enemyInWideFov',kind:'cond',yes:'D',no:'R'}},
          {dx:0,dy:1,c:{type:'aim',kind:'action',next:'R'}},
          {dx:1,dy:1,c:{type:Math.random()<.5?'weapon1':'weapon2',kind:'action',next:'U'}},
          {dx:1,dy:0,c:{type:Math.random()<.5?'evade':'turnR',kind:'action',next:'L'}}
        ];
        for(const m of module){const x=ax+m.dx,y=ay+m.dy;if(x>=0&&x<6&&y>=0&&y<6){const pos=y*6+x;if(pos>0)p[pos]={...m.c};}}
      }
      n.p=repair(p);
    }
    return n;
  }
  function crossover(a,b){
    const c=cfg(a.p,a.w1,a.w2);c.p=cloneProgram(a.p);
    const x0=Math.floor(Math.random()*5),y0=Math.floor(Math.random()*5),w=1+Math.floor(Math.random()*(6-x0)),h=1+Math.floor(Math.random()*(6-y0));
    for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++){const i=y*6+x;if(i>0)c.p[i]=b.p[i]?{...b.p[i]}:null;}
    if(Math.random()<.35)c.w1=b.w1;if(Math.random()<.35)c.w2=b.w2;c.p=repair(c.p);return c;
  }
  function scoreAgainst(v,opps,seeds,count=QUICK){
    let w=0,d=0,l=0,margin=0,resolved=0;
    for(let i=0;i<count;i++){
      const q=opps[i%opps.length],seed=seeds[i%seeds.length],r1=sim(v,q,seed),r2=sim(q,v,seed);
      for(const [r,side] of [[r1,1],[r2,-1]]){
        const win=side===1?r.winner>0:r.winner<0,loss=side===1?r.winner<0:r.winner>0;
        if(win)w++;else if(loss)l++;else d++;if(r.resolved)resolved++;margin+=side===1?r.a-r.b:r.b-r.a;
      }
      battleCount+=2;
    }
    const games=count*2,wr=w/games,m=Math.max(-1,Math.min(1,margin/(games*100))),rr=resolved/games;
    return{score:1000*(.92*wr+.05*((m+1)/2)+.03*rr),w,d,l,wr,margin,resolved:rr};
  }
  function tournament(pool,k=4){
    let best=null;for(let i=0;i<k;i++){const x=pool[Math.floor(Math.random()*pool.length)];if(!best||x.score>best.score)best=x;}return best;
  }
  function putArchive(e){const key=descriptor(e.v),old=archive.get(key);if(!old||e.score>old.score)archive.set(key,e);}

  const seedPrograms=weaponAwareSeeds(),starters=[];
  for(const p of seedPrograms)for(const w1 of weaponList)for(const w2 of weaponList)starters.push(cfg(p,w1,w2));
  const baselineProfiles=[
    cfg(handDesignedChampion('A'),'rifle','mine'),cfg(handDesignedChampion('A'),'heavy','rapid'),
    cfg(handDesignedChampion('B'),'burst','killer'),cfg(strategicSeeds()[0],'rapid','mine'),cfg(strategicSeeds()[1],'heavy','killer')
  ];
  const trainOpp=starters.filter((_,i)=>i%17===0).slice(0,24);
  const trainSeeds=Array.from({length:QUICK},(_,i)=>810000000+i*977);
  const valSeeds=Array.from({length:VAL},(_,i)=>1210000000+i*10007);
  const baselineSeeds=Array.from({length:VAL},(_,i)=>1310000000+i*12011);
  let scored=starters.map(v=>({v,...scoreAgainst(v,trainOpp,trainSeeds)})).sort((a,b)=>b.score-a.score);
  let population=scored.slice(0,POP);for(const e of population)putArchive(e);hall.push(...population.slice(0,ELITE).map(e=>e.v));
  let bestTrain=population[0],bestValidated=null;
  function validate(v){
    const valOpp=[...baselineProfiles,...hall.slice(-10),...population.slice(0,8).map(e=>e.v)],vr=scoreAgainst(v,valOpp,valSeeds,VAL),br=scoreAgainst(v,baselineProfiles,baselineSeeds,VAL);
    return{v,val:vr,base:br,combined:.62*vr.score+.38*br.score};
  }
  bestValidated=validate(bestTrain.v);

  for(let g=0;g<ITER;g++){
    const genSeeds=Array.from({length:QUICK},(_,i)=>900000000+g*100003+i*977);
    const archivePool=[...archive.values()].sort((a,b)=>b.score-a.score).slice(0,48);
    const opponentPool=[...hall,...population.slice(0,12).map(e=>e.v),...trainOpp].slice(0,32);
    const offspring=[];
    while(offspring.length<POP-ELITE){
      const parent=tournament(Math.random()<.35&&archivePool.length?archivePool:population).v;
      let child=mutate(parent);
      if(Math.random()<.62){const mate=tournament(Math.random()<.5&&archivePool.length?archivePool:population).v;child=crossover(child,mate);}
      if(Math.random()<.28)child=mutate(child);
      const ce={v:child,...scoreAgainst(child,opponentPool,genSeeds)};offspring.push(ce);putArchive(ce);
    }
    const elites=population.slice().sort((a,b)=>b.score-a.score).slice(0,ELITE);
    const merged=[...elites,...offspring];
    // Re-evaluate merged candidates on identical conditions to avoid seed luck.
    population=merged.map(e=>({v:e.v,...scoreAgainst(e.v,opponentPool,genSeeds)})).sort((a,b)=>b.score-a.score).slice(0,POP);
    if(population[0].score>bestTrain.score){bestTrain=population[0];hall.push(bestTrain.v);if(hall.length>32)hall.shift();}
    for(const e of population.slice(0,8))putArchive(e);

    if(g%20===0||g===ITER-1){
      const candidates=[bestTrain.v,...population.slice(0,8).map(e=>e.v),...[...archive.values()].sort((a,b)=>b.score-a.score).slice(0,8).map(e=>e.v),...hall.slice(-6)];
      const seen=new Set(),vals=[];
      for(const v of candidates){const s=sig(v);if(seen.has(s))continue;seen.add(s);vals.push(validate(v));}
      vals.sort((a,b)=>b.combined-a.combined);if(vals[0]&&(!bestValidated||vals[0].combined>bestValidated.combined))bestValidated=vals[0];
      evoGen.textContent=`${g} / ${ITER}`;evoBattles.textContent=String(battleCount);evoBest.textContent=(bestValidated?.combined||0).toFixed(1);evoProgress.style.width=(g/ITER*90).toFixed(1)+'%';
      evoDetail.textContent=`高度探索：Train ${(bestTrain.wr*100).toFixed(1)}% / Validation ${(bestValidated.val.wr*100).toFixed(1)}% / Baseline ${(bestValidated.base.wr*100).toFixed(1)}% / Archive ${archive.size} / ${weaponName[bestValidated.v.w1]}＋${weaponName[bestValidated.v.w2]}`;
      await new Promise(r=>setTimeout(r,0));
    }
  }

  const finalistCandidates=[bestValidated.v,bestTrain.v,...population.slice(0,12).map(e=>e.v),...[...archive.values()].sort((a,b)=>b.score-a.score).slice(0,16).map(e=>e.v),...hall.slice(-10)];
  const uniq=[],seenFinal=new Set();for(const v of finalistCandidates){const s=sig(v);if(!seenFinal.has(s)){seenFinal.add(s);uniq.push(v);}}
  const testSeeds=Array.from({length:FINAL},(_,i)=>1600000000+i*17011),testOpp=[...baselineProfiles,...uniq.slice(0,12)];
  const rf=uniq.map(v=>({v,...scoreAgainst(v,testOpp,testSeeds,FINAL)})).sort((a,b)=>b.score-a.score);
  const first=rf[0]?.v||bestValidated.v,second=rf[1]?.v||population[1]?.v||first;
  programs.A=repair(first.p);programs.B=repair(second.p);
  weaponA1Sel.value=first.w1;weaponA2Sel.value=first.w2;weaponB1Sel.value=second.w1;weaponB2Sel.value=second.w2;
  editSide='A';selectedCell=1;state={A:{pc:0,acc:0,flag:false,timer:0,lastSeen:0,lastHp:100,hitRecent:0,lockTime:0},B:{pc:0,acc:0,flag:false,timer:0,lastSeen:0,lastHp:100,hitRecent:0,lockTime:0}};
  renderProgram();evoGen.textContent=`${ITER} + Test`;evoBattles.textContent=String(battleCount);evoBest.textContent=rf[0]?rf[0].score.toFixed(1):bestValidated.combined.toFixed(1);evoProgress.style.width='100%';
  evoDetail.textContent=`完了：Train ${(bestTrain.wr*100).toFixed(1)}% / Validation ${(bestValidated.val.wr*100).toFixed(1)}% / Baseline ${(bestValidated.base.wr*100).toFixed(1)}% / Test ${rf[0]?(rf[0].wr*100).toFixed(1):'-'}% / Archive ${archive.size}`;
  statusEl.textContent='高度探索完了。交叉・戦術アーカイブ・殿堂・未知条件評価を使って再選抜しました。';
  optimizeBtn.disabled=false;
};
