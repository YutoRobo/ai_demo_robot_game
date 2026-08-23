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

// The optimizer is injected after this file. Patch on the next task so the simulator exists.
function installTacticalOptimizerRules(){
  if(typeof simulateBattleWeaponAware!=='function')return false;
  if(simulateBattleWeaponAware.__tacticalActivityPatched)return true;

  const marker="if(c==='enemyRight')return v.visible&&v.signed>0;";
  const extra=`if(c==='enemyFacingMe'){const e=op(side),a=Math.abs(nrm(Math.atan2(m.y-e.y,m.x-e.x)-e.ang));return v.visible&&a<=20*Math.PI/180;}if(c==='behindEnemy'){const e=op(side),a=Math.abs(nrm(Math.atan2(m.y-e.y,m.x-e.x)-e.ang));return v.visible&&a>=135*Math.PI/180;}if(c==='enemyWithin100')return v.visible&&v.dd<=100;if(c==='enemyWithin200')return v.visible&&v.dd<=200;if(c==='enemyWithin300')return v.visible&&v.dd<=300;if(c==='weapon1Ammo'){const w=profiles[side][0];return w==='mine'?m.mineStock>0:w==='killer'?m.killerReady:!!(m.ammo&&m.ammo[w]>0);}if(c==='weapon2Ammo'){const w=profiles[side][1];return w==='mine'?m.mineStock>0:w==='killer'?m.killerReady:!!(m.ammo&&m.ammo[w]>0);}`;
  let src=simulateBattleWeaponAware.toString();
  if(!src.includes(marker)){console.error('tactical simulator marker not found');return false;}
  src=src.replace(marker,marker+extra);
  let patched;
  try{patched=eval('('+src+')');}catch(err){console.error('tactical simulator patch failed',err);return false;}

  const baseSim=patched;
  const wrapped=function(...args){
    const r=baseSim(...args);
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

    // Spinning/aiming without ever attacking is not combat. It loses to any opponent that attacks.
    if(aa.nonCombat&&!bb.nonCombat){r.a=0;r.b=Math.max(r.b,1);r.winner=-1;r.resolved=true;}
    else if(bb.nonCombat&&!aa.nonCombat){r.b=0;r.a=Math.max(r.a,1);r.winner=1;r.resolved=true;}
    else if(aa.nonCombat&&bb.nonCombat){r.winner=0;r.resolved=false;}
    // If neither side dealt damage, prefer the side that actually attempted sustained combat.
    else if(aa.weakCombat&&!bb.weakCombat&&aa.damage===0&&bb.damage===0){r.a=0;r.b=Math.max(r.b,1);r.winner=-1;r.resolved=true;}
    else if(bb.weakCombat&&!aa.weakCombat&&aa.damage===0&&bb.damage===0){r.b=0;r.a=Math.max(r.a,1);r.winner=1;r.resolved=true;}
    return r;
  };
  wrapped.__tacticalActivityPatched=true;
  simulateBattleWeaponAware=wrapped;
  return true;
}
setTimeout(()=>{
  installTacticalOptimizerRules();
  renderPalette();renderProgram();
},0);
