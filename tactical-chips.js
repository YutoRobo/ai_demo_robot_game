// Tactical condition chips. Injected inside the game closure by index.html.
const TACTICAL_CHIPS=[
  ['enemyFacingMe','IF 敵がこちら向き','cond'],
  ['behindEnemy','IF 敵の背後','cond'],
  ['enemyWithin100','IF 距離100以内','cond'],
  ['enemyWithin200','IF 距離200以内','cond'],
  ['enemyWithin300','IF 距離300以内','cond'],
  ['weapon1Ammo','IF 武器1残弾あり','cond'],
  ['weapon2Ammo','IF 武器2残弾あり','cond']
];
for(const def of TACTICAL_CHIPS)if(!chipTypes.some(x=>x[0]===def[0]))chipTypes.push(def);

function commonBattlefield(rng=Math.random){
  const margin=55,minSep=200,obs=randomObstacles(rng);
  let ax,ay,bx,by,tries=0;
  do{
    ax=margin+rng()*(cv.width-2*margin);ay=margin+rng()*(cv.height-2*margin);
    bx=margin+rng()*(cv.width-2*margin);by=margin+rng()*(cv.height-2*margin);
    tries++;
  }while((Math.hypot(ax-bx,ay-by)<minSep||obs.some(o=>circleRectHit(ax,ay,28,o)||circleRectHit(bx,by,28,o)))&&tries<400);
  return{obs,ax,ay,bx,by};
}
randomBattleStart=function(){
  const f=commonBattlefield(Math.random);obstacles=f.obs;
  return{A:bot(f.ax,f.ay,Math.random()*Math.PI*2,'A'),B:bot(f.bx,f.by,Math.random()*Math.PI*2,'B')};
};

function tacticalAmmoAvailable(me,weapon){
  if(weapon==='mine')return (me.mineStock||0)>0;
  if(weapon==='killer')return !!me.killerReady;
  return !!(me.ammo&&me.ammo[weapon]>0);
}
function tacticalEnemyFacing(me,enemy,nrm=norm){return Math.abs(nrm(Math.atan2(me.y-enemy.y,me.x-enemy.x)-enemy.ang));}
function tacticalLiveCondition(side,c){
  const me=self(side),enemy=opponent(side),v=visionLayers(me,enemy),visible=v.any;
  if(c==='enemyFacingMe')return visible&&tacticalEnemyFacing(me,enemy)<=20*Math.PI/180;
  if(c==='behindEnemy')return visible&&tacticalEnemyFacing(me,enemy)>=135*Math.PI/180;
  if(c==='enemyWithin100')return visible&&v.d<=100;
  if(c==='enemyWithin200')return visible&&v.d<=200;
  if(c==='enemyWithin300')return visible&&v.d<=300;
  if(c==='weapon1Ammo')return tacticalAmmoAvailable(me,side==='A'?weaponA1Sel.value:weaponB1Sel.value);
  if(c==='weapon2Ammo')return tacticalAmmoAvailable(me,side==='A'?weaponA2Sel.value:weaponB2Sel.value);
  return null;
}
const baseCondOKTactical=condOK;
condOK=function(side,c){const r=tacticalLiveCondition(side,c);return r===null?baseCondOKTactical(side,c):r;};

if(typeof teamCond==='function'){
  const baseTeamCondTactical=teamCond;
  teamCond=function(me,s,c){
    const enemy=nearestEnemy(me),v=teamVision(me,enemy),visible=v.any;
    if(c==='enemyFacingMe')return !!enemy&&visible&&tacticalEnemyFacing(me,enemy)<=20*Math.PI/180;
    if(c==='behindEnemy')return !!enemy&&visible&&tacticalEnemyFacing(me,enemy)>=135*Math.PI/180;
    if(c==='enemyWithin100')return visible&&v.d<=100;
    if(c==='enemyWithin200')return visible&&v.d<=200;
    if(c==='enemyWithin300')return visible&&v.d<=300;
    if(c==='weapon1Ammo')return tacticalAmmoAvailable(me,teamWeapon(me.side,0));
    if(c==='weapon2Ammo')return tacticalAmmoAvailable(me,teamWeapon(me.side,1));
    return baseTeamCondTactical(me,s,c);
  };
}

function compactCombatProgram(){
  const p=Array(36).fill(null);
  p[1]={type:'enemyInWideFov',kind:'cond',yes:'D',no:'R'};
  p[2]={type:'turnR',kind:'action',next:'L'};
  p[7]={type:'aim',kind:'action',next:'R'};
  p[8]={type:'canShoot',kind:'cond',yes:'R',no:'L'};
  p[9]={type:'weapon1',kind:'action',next:'D'};
  p[15]={type:'strafeR',kind:'action',next:'U'};
  return p;
}

function installTacticalOptimizerRules(){
  if(typeof simulateBattleWeaponAware!=='function')return false;
  if(simulateBattleWeaponAware.__tacticalActivityPatched)return true;
  const sourceSim=(typeof baseSimCpu==='function')?baseSimCpu:simulateBattleWeaponAware;
  let src=sourceSim.toString();
  const oldArena="const rng=seeded(seed),margin=50,minSep=180,obs=randomObstacles(rng);let ax,ay,bx,by;do{ax=margin+rng()*(cv.width-2*margin);ay=margin+rng()*(cv.height-2*margin);bx=margin+rng()*(cv.width-2*margin);by=margin+rng()*(cv.height-2*margin);}while(Math.hypot(ax-bx,ay-by)<minSep||obs.some(o=>circleRectHit(ax,ay,28,o)||circleRectHit(bx,by,28,o)));";
  const newArena="const rng=seeded(seed),field=commonBattlefield(rng),obs=field.obs,ax=field.ax,ay=field.ay,bx=field.bx,by=field.by;";
  if(!src.includes(oldArena)){console.error('optimizer battlefield marker not found');return false;}
  src=src.replace(oldArena,newArena);
  const marker="if(c==='enemyRight')return v.visible&&v.signed>0;";
  const extra=`if(c==='enemyFacingMe'){const e=op(side),a=Math.abs(nrm(Math.atan2(m.y-e.y,m.x-e.x)-e.ang));return v.visible&&a<=20*Math.PI/180;}if(c==='behindEnemy'){const e=op(side),a=Math.abs(nrm(Math.atan2(m.y-e.y,m.x-e.x)-e.ang));return v.visible&&a>=135*Math.PI/180;}if(c==='enemyWithin100')return v.visible&&v.dd<=100;if(c==='enemyWithin200')return v.visible&&v.dd<=200;if(c==='enemyWithin300')return v.visible&&v.dd<=300;if(c==='weapon1Ammo'){const w=profiles[side][0];return w==='mine'?m.mineStock>0:w==='killer'?m.killerReady:!!(m.ammo&&m.ammo[w]>0);}if(c==='weapon2Ammo'){const w=profiles[side][1];return w==='mine'?m.mineStock>0:w==='killer'?m.killerReady:!!(m.ammo&&m.ammo[w]>0);}`;
  if(!src.includes(marker)){console.error('tactical simulator marker not found');return false;}
  src=src.replace(marker,marker+extra);
  let patched;
  try{patched=eval('('+src+')');}catch(err){console.error('tactical simulator patch failed',err);return false;}
  const activitySim=function(...args){
    const r=patched(...args);
    if(!r||!r.stats)return r;
    const combat=(st)=>{
      const translation=(st.move||0)+(st.evade||0);
      const orientation=(st.turn||0)+(st.aim||0);
      const attacks=(st.shoot||0)+(st.mine||0)+(st.killer||0);
      const damage=st.damage||0;
      const nonCombat=attacks===0&&damage===0;
      const weakCombat=damage===0&&attacks<2;
      return{translation,orientation,attacks,damage,nonCombat,weakCombat};
    };
    const aa=combat(r.stats.A),bb=combat(r.stats.B);
    r.activity={A:aa,B:bb};
    if(aa.nonCombat&&!bb.nonCombat){r.a=0;r.b=Math.max(r.b,1);r.winner=-1;r.resolved=true;}
    else if(bb.nonCombat&&!aa.nonCombat){r.b=0;r.a=Math.max(r.a,1);r.winner=1;r.resolved=true;}
    else if(aa.nonCombat&&bb.nonCombat){r.winner=0;r.resolved=false;}
    else if(aa.weakCombat&&!bb.weakCombat&&aa.damage===0&&bb.damage===0){r.a=0;r.b=Math.max(r.b,1);r.winner=-1;r.resolved=true;}
    else if(bb.weakCombat&&!aa.weakCombat&&aa.damage===0&&bb.damage===0){r.b=0;r.a=Math.max(r.a,1);r.winner=1;r.resolved=true;}
    return r;
  };
  if(typeof baseSimCpu==='function'&&typeof trimProgramToCpu==='function')simulateBattleWeaponAware=function(pa,pb,seed,a1,a2,b1,b2){return activitySim(trimProgramToCpu(pa),trimProgramToCpu(pb),seed,a1,a2,b1,b2);};
  else simulateBattleWeaponAware=activitySim;
  simulateBattleWeaponAware.__tacticalActivityPatched=true;
  simulateBattleWeaponAware.__sharedBattlefield=true;
  return true;
}

function auditInstalledCombatProgram(program=programs.A,w1=weaponA1Sel.value,w2=weaponA2Sel.value){
  if(typeof simulateBattleWeaponAware!=='function')return null;
  const active=compactCombatProgram();
  const baselines=[
    {p:active,w1:'rifle',w2:'rapid'},
    {p:active,w1:'heavy',w2:'rapid'},
    {p:handDesignedChampion('A'),w1:'rifle',w2:'mine'},
    {p:strategicSeeds()[0],w1:'rapid',w2:'mine'}
  ];
  const N=24;
  let games=0,wins=0,draws=0,losses=0,resolved=0,attacks=0,damage=0,translation=0,orientation=0,nonCombat=0;
  function add(r,side){
    if(!r)return;games++;
    const win=side==='A'?r.winner>0:r.winner<0,loss=side==='A'?r.winner<0:r.winner>0;
    if(win)wins++;else if(loss)losses++;else draws++;if(r.resolved)resolved++;
    const ac=r.activity?.[side]||null,st=r.stats?.[side]||{};
    attacks+=ac?ac.attacks:(st.shoot||0)+(st.mine||0)+(st.killer||0);
    damage+=ac?ac.damage:(st.damage||0);
    translation+=ac?ac.translation:(st.move||0)+(st.evade||0);
    orientation+=ac?ac.orientation:(st.turn||0)+(st.aim||0);
    if(ac?.nonCombat)nonCombat++;
  }
  for(let i=0;i<N;i++){
    const q=baselines[i%baselines.length],seed=1880000000+i*23003;
    add(simulateBattleWeaponAware(program,q.p,seed,w1,w2,q.w1,q.w2),'A');
  }
  if(!games)return null;
  return{games,wins,draws,losses,winRate:wins/games,resolvedRate:resolved/games,timeoutRate:(games-resolved)/games,attacks:attacks/games,damage:damage/games,translation:translation/games,orientation:orientation/games,nonCombatRate:nonCombat/games};
}

function installOptimizerCombatAudit(){
  if(typeof optimizeHybrid!=='function'||optimizeHybrid.__combatAuditWrapped)return false;
  const baseOptimize=optimizeHybrid;
  const wrapped=async function(...args){
    const result=await baseOptimize(...args);
    // Snapshot the exact explored candidate and keep it on the board regardless of audit result.
    const exploredA=cloneProgram(programs.A),exploredB=cloneProgram(programs.B);
    const exploredWeapons={A1:weaponA1Sel.value,A2:weaponA2Sel.value,B1:weaponB1Sel.value,B2:weaponB2Sel.value};
    const m=auditInstalledCombatProgram(exploredA,exploredWeapons.A1,exploredWeapons.A2);
    programs.A=exploredA;programs.B=exploredB;
    weaponA1Sel.value=exploredWeapons.A1;weaponA2Sel.value=exploredWeapons.A2;
    weaponB1Sel.value=exploredWeapons.B1;weaponB2Sel.value=exploredWeapons.B2;
    editSide='A';selectedCell=1;
    state={A:{pc:0,acc:0,flag:false,timer:0,lastSeen:0,lastHp:100,hitRecent:0,lockTime:0},B:{pc:0,acc:0,flag:false,timer:0,lastSeen:0,lastHp:100,hitRecent:0,lockTime:0}};
    lastOptimized={A:cloneProgram(programs.A),B:cloneProgram(programs.B)};
    renderProgram();
    if(m){
      const pct=x=>(100*x).toFixed(1)+'%';
      const invalid=m.attacks<0.5||m.nonCombatRate>0.5;
      evoDetail.textContent=`${evoDetail.textContent} / 動的監査${m.games}戦: 勝率 ${pct(m.winRate)}・決着率 ${pct(m.resolvedRate)}・非戦闘 ${pct(m.nonCombatRate)}・平均攻撃 ${m.attacks.toFixed(1)}回・平均与ダメ ${m.damage.toFixed(1)}・平均移動/回避 ${m.translation.toFixed(1)}回${invalid?' / ⚠ 非戦闘傾向あり（探索結果は盤面維持）':''}`;
      statusEl.textContent=invalid
        ?`探索結果をそのまま盤面へ反映しました。ただし動的監査では非戦闘傾向があります（平均攻撃 ${m.attacks.toFixed(1)}回、平均与ダメ ${m.damage.toFixed(1)}）。`
        :`探索結果を盤面へ反映しました。動的監査${m.games}戦：勝率 ${pct(m.winRate)}、決着率 ${pct(m.resolvedRate)}、平均攻撃 ${m.attacks.toFixed(1)}回、平均与ダメ ${m.damage.toFixed(1)}。`;
    }
    return result;
  };
  wrapped.__combatAuditWrapped=true;
  optimizeHybrid=wrapped;
  return true;
}

setTimeout(()=>{
  const ok=installTacticalOptimizerRules();
  installOptimizerCombatAudit();
  renderPalette();renderProgram();
  if(!ok)console.error('shared battlefield optimizer patch was not installed');
},0);
