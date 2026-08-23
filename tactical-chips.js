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

// Upgrade the seeded weapon-aware simulator so optimizer/Champion Gate use the same new conditions.
(function patchTacticalSimulator(){
  if(typeof simulateBattleWeaponAware!=='function')return;
  const marker="if(c==='enemyRight')return v.visible&&v.signed>0;";
  const extra=`if(c==='enemyFacingMe'){const e=op(side),a=Math.abs(nrm(Math.atan2(m.y-e.y,m.x-e.x)-e.ang));return v.visible&&a<=20*Math.PI/180;}if(c==='behindEnemy'){const e=op(side),a=Math.abs(nrm(Math.atan2(m.y-e.y,m.x-e.x)-e.ang));return v.visible&&a>=135*Math.PI/180;}if(c==='enemyWithin100')return v.visible&&v.dd<=100;if(c==='enemyWithin200')return v.visible&&v.dd<=200;if(c==='enemyWithin300')return v.visible&&v.dd<=300;if(c==='weapon1Ammo'){const w=profiles[side][0];return w==='mine'?m.mineStock>0:w==='killer'?m.killerReady:!!(m.ammo&&m.ammo[w]>0);}if(c==='weapon2Ammo'){const w=profiles[side][1];return w==='mine'?m.mineStock>0:w==='killer'?m.killerReady:!!(m.ammo&&m.ammo[w]>0);}`;
  let src=simulateBattleWeaponAware.toString();
  if(!src.includes(marker)){console.error('tactical simulator marker not found');return;}
  src=src.replace(marker,marker+extra);
  try{simulateBattleWeaponAware=eval('('+src+')');}catch(err){console.error('tactical simulator patch failed',err);}
})();

setTimeout(()=>{renderPalette();renderProgram();},0);
