// Authoritative deterministic battle simulator + consistency diagnostic.
// Loaded last inside the game closure so optimizer/audits use one measured simulation path.
(function installAuthoritativeSimulator(){
  const DIAG_SEED=1908082401;

  function authoritativeBattleSimulator(pa,pb,seed,a1,a2,b1,b2){
    const rng=seeded(seed);
    const field=(typeof commonBattlefield==='function')?commonBattlefield(rng):null;
    const obs=field?field.obs:randomObstacles(rng);
    let ax=field?.ax,ay=field?.ay,bx=field?.bx,by=field?.by;
    if(!field){
      const margin=55,minSep=200;let tries=0;
      do{
        ax=margin+rng()*(cv.width-2*margin);ay=margin+rng()*(cv.height-2*margin);
        bx=margin+rng()*(cv.width-2*margin);by=margin+rng()*(cv.height-2*margin);tries++;
      }while((Math.hypot(ax-bx,ay-by)<minSep||obs.some(o=>circleRectHit(ax,ay,28,o)||circleRectHit(bx,by,28,o)))&&tries<400);
    }
    const progA=typeof trimProgramToCpu==='function'?trimProgramToCpu(pa):cloneProgram(pa);
    const progB=typeof trimProgramToCpu==='function'?trimProgramToCpu(pb):cloneProgram(pb);
    const profiles={A:[a1,a2],B:[b1,b2]};
    function mk(x,y,side,w1,w2){
      const c=typeof chassisStats==='function'?chassisStats(side):{hp:100,move:1,strafe:1,turn:1};
      const ep=typeof equipmentPerformance==='function'?equipmentPerformance(side,w1,w2):{move:1,strafe:1,turn:1};
      return{x,y,ang:rng()*Math.PI*2,hp:c.hp,maxHp:c.hp,moveMul:c.move*ep.move,strafeMul:c.strafe*ep.strafe,turnMul:c.turn*ep.turn,cd:0,r:18,killerReady:true,mineStock:3,ammo:{rifle:12,burst:6,heavy:5,rapid:28}};
    }
    const bots={A:mk(ax,ay,'A',a1,a2),B:mk(bx,by,'B',b1,b2)};
    const ss={A:{pc:0,flag:false,timer:0,lastSeen:0,lastHp:bots.A.hp,hitRecent:0,lockTime:0},B:{pc:0,flag:false,timer:0,lastSeen:0,lastHp:bots.B.hp,hitRecent:0,lockTime:0}};
    const shots=[],simMines=[];
    const makeStats=()=>({shoot:0,killer:0,mine:0,mineKill:0,evade:0,move:0,aim:0,turn:0,back:0,dist:0,ticks:0,visited:new Set(),visitedCount:0,damage:0,narrowChecks:0,mediumChecks:0,wideChecks:0,losLost:0});
    const stats={A:makeStats(),B:makeStats()};
    const me=s=>bots[s],op=s=>bots[s==='A'?'B':'A'];
    const nrm=a=>{while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a;};
    function detect(side){
      const m=me(side),o=op(side),dd=Math.hypot(m.x-o.x,m.y-o.y),signed=nrm(Math.atan2(o.y-m.y,o.x-m.x)-m.ang),diff=Math.abs(signed);
      const los=!lineBlockedByObstacle(m,o,obs);if(!los)stats[side].losLost++;
      const narrow=los&&diff<=20*Math.PI/180&&dd<=330,medium=los&&diff<=45*Math.PI/180&&dd<=245,wide=los&&diff<=75*Math.PI/180&&dd<=170;
      return{dd,signed,diff,narrow,medium,wide,visible:narrow||medium||wide};
    }
    function nearest(side){const m=me(side);let q=null,bd=Infinity;for(const x of shots)if(x.owner!==side){const d=Math.hypot(x.x-m.x,x.y-m.y);if(d<bd){bd=d;q=x;}}return{q,d:bd};}
    function ammoAvailable(m,w){if(w==='mine')return m.mineStock>0;if(w==='killer')return m.killerReady;return !!m.ammo?.[w];}
    function cond(side,c){
      const m=me(side),e=op(side),s=ss[side],v=detect(side);
      if(v.visible)s.lastSeen=0;
      if(c==='enemyInNarrowFov'){stats[side].narrowChecks++;return v.narrow;}
      if(c==='enemyInMediumFov'){stats[side].mediumChecks++;return v.medium;}
      if(c==='enemyInWideFov'){stats[side].wideChecks++;return v.wide;}
      if(c==='enemyFront')return v.visible&&v.diff<22*Math.PI/180;
      if(c==='enemyNear')return v.visible&&v.dd<150;
      if(c==='enemyFar')return v.visible&&v.dd>220;
      if(c==='enemyLeft')return v.visible&&v.signed<0;
      if(c==='enemyRight')return v.visible&&v.signed>0;
      if(c==='enemyFacingMe'){const a=Math.abs(nrm(Math.atan2(m.y-e.y,m.x-e.x)-e.ang));return v.visible&&a<=20*Math.PI/180;}
      if(c==='behindEnemy'){const a=Math.abs(nrm(Math.atan2(m.y-e.y,m.x-e.x)-e.ang));return v.visible&&a>=135*Math.PI/180;}
      if(c==='enemyWithin100')return v.visible&&v.dd<=100;
      if(c==='enemyWithin200')return v.visible&&v.dd<=200;
      if(c==='enemyWithin300')return v.visible&&v.dd<=300;
      if(c==='weapon1Ammo')return ammoAvailable(m,profiles[side][0]);
      if(c==='weapon2Ammo')return ammoAvailable(m,profiles[side][1]);
      if(c==='hpLow')return m.hp<.4*(m.maxHp||100);
      if(c==='bulletNear')return nearest(side).d<90;
      if(c==='bulletLeft'||c==='bulletRight'){const nb=nearest(side);if(!nb.q||nb.d>140)return false;const a=nrm(Math.atan2(nb.q.y-m.y,nb.q.x-m.x)-m.ang);return c==='bulletLeft'?a<0:a>0;}
      if(c==='hitRecent')return s.hitRecent>0;
      if(c==='lostEnemy')return s.lastSeen>1;
      if(c==='flagSet')return s.flag;
      if(c==='timer2s')return s.timer>=2;
      if(c==='wallNear')return m.x<65||m.x>cv.width-65||m.y<65||m.y>cv.height-65||obs.some(o=>circleRectHit(m.x,m.y,58,o));
      if(c==='canShoot')return m.cd<=0&&v.visible&&v.diff<18*Math.PI/180;
      return false;
    }
    function mv(o,f,st,t,actionDt){
      o.ang=nrm(o.ang+t*2.1*(o.turnMul||1)*actionDt);const sp=105,ox=o.x,oy=o.y,mm=o.moveMul||1,sm=o.strafeMul||1;
      o.x+=(Math.cos(o.ang)*f*mm+Math.cos(o.ang+Math.PI/2)*st*sm)*sp*actionDt;
      o.y+=(Math.sin(o.ang)*f*mm+Math.sin(o.ang+Math.PI/2)*st*sm)*sp*actionDt;
      o.x=Math.max(24,Math.min(cv.width-24,o.x));o.y=Math.max(24,Math.min(cv.height-24,o.y));
      if(obs.some(ob=>circleRectHit(o.x,o.y,o.r,ob))){o.x=ox;o.y=oy;}
    }
    function fire(side,w){
      const m=me(side),s=ss[side],st=stats[side];
      if(w==='mine'){if(m.cd<=0&&m.mineStock>0){m.mineStock--;m.cd=1.8;st.mine++;simMines.push({x:m.x,y:m.y,owner:side,r:20,damage:100});}return;}
      if(w==='killer'){if(m.killerReady&&m.cd<=0&&s.lockTime>=1.2){m.killerReady=false;s.lockTime=0;m.cd=1.1;st.killer++;shots.push({x:m.x+Math.cos(m.ang)*24,y:m.y+Math.sin(m.ang)*24,vx:Math.cos(m.ang)*320,vy:Math.sin(m.ang)*320,owner:side,life:2.1,damage:50});}return;}
      if(m.cd>0||!m.ammo?.[w])return;
      st.shoot++;
      if(w==='rifle'){m.ammo.rifle--;m.cd=.45;shots.push({x:m.x+Math.cos(m.ang)*24,y:m.y+Math.sin(m.ang)*24,vx:Math.cos(m.ang)*320,vy:Math.sin(m.ang)*320,owner:side,life:2.5,damage:12});}
      else if(w==='burst'){m.ammo.burst--;m.cd=.85;for(let i=-1;i<=1;i++){const a=m.ang+i*.055;shots.push({x:m.x+Math.cos(a)*24,y:m.y+Math.sin(a)*24,vx:Math.cos(a)*295,vy:Math.sin(a)*295,owner:side,life:2.2,damage:8});}}
      else if(w==='heavy'){m.ammo.heavy--;m.cd=1.35;shots.push({x:m.x+Math.cos(m.ang)*24,y:m.y+Math.sin(m.ang)*24,vx:Math.cos(m.ang)*225,vy:Math.sin(m.ang)*225,owner:side,life:2.9,damage:36});}
      else if(w==='rapid'){m.ammo.rapid--;m.cd=.16;shots.push({x:m.x+Math.cos(m.ang)*24,y:m.y+Math.sin(m.ang)*24,vx:Math.cos(m.ang)*345,vy:Math.sin(m.ang)*345,owner:side,life:1.9,damage:4});}
    }
    function act(side,a){
      const m=me(side),e=op(side),s=ss[side],st=stats[side],actionDt=.12;
      if(a==='forward'){st.move++;mv(m,1,0,0,actionDt);}else if(a==='back'){st.move++;st.back++;mv(m,-.8,0,0,actionDt);}else if(a==='turnL'){st.turn++;mv(m,0,0,-1,actionDt);}else if(a==='turnR'){st.turn++;mv(m,0,0,1,actionDt);}else if(a==='strafeL'){st.move++;mv(m,0,-.9,0,actionDt);}else if(a==='strafeR'){st.move++;mv(m,0,.9,0,actionDt);}else if(a==='weapon1')fire(side,profiles[side][0]);else if(a==='weapon2')fire(side,profiles[side][1]);else if(a==='flagOn')s.flag=true;else if(a==='flagOff')s.flag=false;else if(a==='timerStart')s.timer=0;else if(a==='aim'){if(!detect(side).visible)return;st.aim++;const da=nrm(Math.atan2(e.y-m.y,e.x-m.x)-m.ang);mv(m,0,0,Math.abs(da)<.05?0:(da>0?1:-1),actionDt);}else if(a==='evade'){st.evade++;const nb=nearest(side);let ssn=rng()<.5?1:-1;if(nb.q){const aa=nrm(Math.atan2(nb.q.y-m.y,nb.q.x-m.x)-m.ang);ssn=aa<0?1:-1;}mv(m,0,ssn,0,actionDt);}
    }
    function exec(side,p){const s=ss[side],st=stats[side];if(s.pc===0){s.pc=1;return;}const chip=p[s.pc];if(!chip){s.pc=0;return;}st.visited.add(s.pc);if(chip.kind==='action'){act(side,chip.type);s.pc=nextCell(s.pc,chip.next);}else s.pc=nextCell(s.pc,cond(side,chip.type)?chip.yes:chip.no);}
    const dt=.04,period=typeof cpuDecisionPeriod==='function'?cpuDecisionPeriod():.12;let acc={A:0,B:0},resolved=false;
    for(let tick=0;tick<4500&&bots.A.hp>0&&bots.B.hp>0;tick++){
      for(const side of ['A','B']){const s=ss[side],m=me(side),v=detect(side);m.cd=Math.max(0,m.cd-dt);s.timer+=dt;s.lastSeen=v.visible?0:s.lastSeen+dt;s.hitRecent=Math.max(0,s.hitRecent-dt);s.lockTime=v.visible&&v.diff<8*Math.PI/180?Math.min(1.5,s.lockTime+dt):Math.max(0,s.lockTime-dt*2);if(m.hp<s.lastHp)s.hitRecent=.8;s.lastHp=m.hp;stats[side].dist+=v.dd;stats[side].ticks++;}
      for(const side of ['A','B']){acc[side]+=dt;if(acc[side]+1e-9>=period){acc[side]=0;exec(side,side==='A'?progA:progB);}}
      for(const q of shots){q.x+=q.vx*dt;q.y+=q.vy*dt;q.life-=dt;if(obs.some(o=>q.x>=o.x&&q.x<=o.x+o.w&&q.y>=o.y&&q.y<=o.y+o.h)){q.life=-1;continue;}const target=q.owner==='A'?bots.B:bots.A;if(q.life>0&&Math.hypot(q.x-target.x,q.y-target.y)<target.r+5){target.hp=Math.max(0,target.hp-q.damage);stats[q.owner].damage+=q.damage;q.life=-1;}}
      for(let i=shots.length-1;i>=0;i--)if(shots[i].life<=0||shots[i].x<-20||shots[i].x>cv.width+20||shots[i].y<-20||shots[i].y>cv.height+20)shots.splice(i,1);
      for(let i=simMines.length-1;i>=0;i--){const m=simMines[i],t=m.owner==='A'?bots.B:bots.A;if(Math.hypot(t.x-m.x,t.y-m.y)<t.r+m.r){t.hp=Math.max(0,t.hp-m.damage);stats[m.owner].damage+=m.damage;stats[m.owner].mineKill++;simMines.splice(i,1);}}
      if(bots.A.hp<=0||bots.B.hp<=0){resolved=true;break;}
    }
    for(const side of ['A','B']){stats[side].visitedCount=stats[side].visited.size;delete stats[side].visited;}
    const winner=bots.B.hp<=0?1:bots.A.hp<=0?-1:0;
    const activity={};for(const side of ['A','B']){const st=stats[side],attacks=st.shoot+st.mine+st.killer;activity[side]={attacks,damage:st.damage,translation:st.move+st.evade,orientation:st.turn+st.aim,nonCombat:attacks===0&&st.damage===0,weakCombat:st.damage===0&&attacks<2};}
    return{a:bots.A.hp,b:bots.B.hp,winner,resolved,score:bots.A.hp-bots.B.hp+winner*180-(resolved?0:120),stats,activity};
  }

  simulateBattleWeaponAware=authoritativeBattleSimulator;
  simulateBattleWeaponAware.__authoritativeMeasured=true;

  function summary(r,side='A'){const st=r?.stats?.[side]||{};return{winner:r?.winner??null,resolved:!!r?.resolved,shoot:+(st.shoot||0),mine:+(st.mine||0),killer:+(st.killer||0),damage:+(st.damage||0),move:+(st.move||0),evade:+(st.evade||0),aim:+(st.aim||0),turn:+(st.turn||0),visitedCount:+(st.visitedCount||0)};}
  function probeProgram(type){const p=Array(36).fill(null);p[1]={type,kind:'action',next:'R'};p[2]={type:'weapon1',kind:'action',next:'L'};return p;}
  function makeReport(){
    const pa=cloneProgram(handDesignedChampion('A')),pb=cloneProgram(handDesignedChampion('B'));
    const wait=probeProgram('wait'),attack=probeProgram('weapon1'),move=probeProgram('forward'),turn=probeProgram('turnR');
    const normal=summary(authoritativeBattleSimulator(pa,pb,DIAG_SEED,'rifle','mine','burst','killer'));
    const probes={attack:summary(authoritativeBattleSimulator(attack,wait,DIAG_SEED+11,'rifle','mine','rifle','mine')),move:summary(authoritativeBattleSimulator(move,wait,DIAG_SEED+12,'rifle','mine','rifle','mine')),turn:summary(authoritativeBattleSimulator(turn,wait,DIAG_SEED+13,'rifle','mine','rifle','mine'))};
    return{timestamp:new Date().toISOString(),seed:DIAG_SEED,cpuClass:typeof cpuClass!=='undefined'?cpuClass:null,cpuLimit:typeof cpuChipLimit==='function'?cpuChipLimit():null,normal,probes,engine:'authoritative-measured-v2'};
  }
  function renderReport(r){const f=x=>`攻${x.shoot+x.mine+x.killer}/与${x.damage}/移${x.move+x.evade}/旋${x.turn}/訪${x.visitedCount}`;const ok=(r.probes.attack.shoot>0||r.probes.attack.mine>0||r.probes.attack.killer>0)&&r.probes.move.move>0&&r.probes.turn.turn>0;evoDetail.textContent=`固定seed ${r.seed} / 手設計 ${f(r.normal)} / 強制射撃 ${f(r.probes.attack)} / 強制前進 ${f(r.probes.move)} / 強制旋回 ${f(r.probes.turn)} / 計測実行器 ${ok?'正常':'異常'} / engine ${r.engine}`;statusEl.textContent=ok?'シミュレータ診断：命令実行と行動統計の計測は正常です。20世代の探索を再試験できます。':'シミュレータ診断：強制命令の計測に異常があります。探索はまだ実行しないでください。';}
  function downloadReport(r){try{const blob=new Blob([JSON.stringify(r,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`robot-ai-simulator-diagnostic-${r.seed}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(_e){}}
  setTimeout(()=>{const section=optimizeBtn?.closest?.('.section');if(!section)return;const old=root.querySelector('#simDiagBtn');if(old)old.remove();const btn=document.createElement('button');btn.type='button';btn.id='simDiagBtn';btn.textContent='シミュレータ診断';btn.addEventListener('click',()=>{try{const r=makeReport();window.__robotSimulatorDiagnostic=r;renderReport(r);downloadReport(r);}catch(err){console.error(err);statusEl.textContent='シミュレータ診断エラー：'+(err?.message||err);}});section.querySelector('.controls')?.appendChild(btn);},0);

  setTimeout(()=>{
    simulateBattleWeaponAware=authoritativeBattleSimulator;
    simulateBattleWeaponAware.__authoritativeMeasured=true;
    simulateBattleWeaponAware.__sharedBattlefield=true;
    simulateBattleWeaponAware.__tacticalActivityPatched=true;
  },0);
})();

// Quality patch for the sparse 300-population optimizer.
// Keeps win rate dominant while rejecting structurally degenerate programs before battle evaluation.
(function installSparseOptimizerQualityPatch(){
  if(typeof optimizeHybrid!=='function')return;
  function reachableIndices(p){
    const seen=new Set([0]),q=[0];
    while(q.length){const i=q.shift(),c=i===0?{kind:'action',next:'R'}:p[i];if(!c)continue;const ns=c.kind==='action'?[nextCell(i,c.next)]:[nextCell(i,c.yes),nextCell(i,c.no)];for(const n of ns){if(n===i||n<0||n>=36||seen.has(n)||(!p[n]&&n!==0))continue;seen.add(n);q.push(n);}}
    return seen;
  }
  function combatProgramQuality(program){
    const p=typeof trimProgramToCpu==='function'?trimProgramToCpu(program):cloneProgram(program),reach=reachableIndices(p),types=[...reach].filter(i=>i>0).map(i=>p[i]?.type).filter(Boolean);
    const sensors=new Set(['enemyFront','enemyNear','enemyFar','enemyLeft','enemyRight','enemyInNarrowFov','enemyInMediumFov','enemyInWideFov','enemyFacingMe','behindEnemy','enemyWithin100','enemyWithin200','enemyWithin300','canShoot']);
    const hasSensor=types.some(t=>sensors.has(t)),hasOrient=types.some(t=>['aim','turnL','turnR'].includes(t)),hasWeapon=types.some(t=>t==='weapon1'||t==='weapon2'),hasMove=types.some(t=>['forward','back','strafeL','strafeR','evade'].includes(t));
    const valid=reach.size-1>=4&&hasSensor&&hasOrient&&hasWeapon&&(hasMove||types.includes('aim'));
    return{valid,reachable:reach.size-1,hasSensor,hasOrient,hasWeapon,hasMove};
  }
  let src=optimizeHybrid.toString(),changed=0;
  const replace=(a,b)=>{if(src.includes(a)){src=src.replace(a,b);changed++;}else console.warn('optimizer quality marker missing',a.slice(0,70));};
  replace('TRAIN_OPPS=2','TRAIN_OPPS=4');
  replace("function scoreOf(wr,margin,resolved){const m=Math.max(-1,Math.min(1,margin/100));return 1000*(.92*wr+.05*((m+1)/2)+.03*resolved);}","function scoreOf(wr,margin,resolved,avgDamage,effectiveHit){const m=Math.max(-1,Math.min(1,margin/100)),dn=Math.max(0,Math.min(1,(avgDamage||0)/100)),hn=Math.max(0,Math.min(1,effectiveHit||0));return 1000*(.88*wr+.04*((m+1)/2)+.02*resolved+.04*dn+.02*hn);}");
  replace('function runEval(ind,opps,seedBase){let wins=0',"function runEval(ind,opps,seedBase){const quality=combatProgramQuality(ind.genome.p);if(!quality.valid)return{score:-1000,wr:0,wins:0,draws:0,losses:0,resolved:0,avgMargin:-100,avgDamage:0,effectiveHit:0,behavior:[0,0,0,0,0,0,0,0],nemesisIds:[],opponentIds:opps.map(x=>x.id),invalid:true,quality};let wins=0");
  replace('score:scoreOf(wr,avgMargin,rr),wr,wins,draws,losses,resolved:rr,avgMargin,behavior:',"score:scoreOf(wr,avgMargin,rr,(agg.damage||0)/games,Math.min(1,((agg.damage||0)/games)/Math.max(1,(((agg.shoot||0)+(agg.killer||0)+(agg.mine||0))/games)*12))),wr,wins,draws,losses,resolved:rr,avgMargin,avgDamage:(agg.damage||0)/games,effectiveHit:Math.min(1,((agg.damage||0)/games)/Math.max(1,(((agg.shoot||0)+(agg.killer||0)+(agg.mine||0))/games)*12)),behavior:");
  if(changed<4){console.error('optimizer quality patch incomplete',changed);return;}
  try{
    optimizeHybrid=eval('('+src+')');
    optimizeHybrid.__qualityPatch='combat-structure-damage-v1';
    console.info('optimizer quality patch installed: 4 train opponents, structural gate, damage/effective-hit scoring');
  }catch(err){console.error('optimizer quality patch failed',err);}
})();
