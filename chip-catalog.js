// Metadata-driven chip catalog shared by structural evolution and future optimizers.
// Adding a chip should normally require only a definition here (plus its runtime behavior).
(function installChipCatalog(){
  const defs=[
    {type:'forward',category:'movement',subCategory:'translation'},
    {type:'back',category:'movement',subCategory:'translation'},
    {type:'strafeL',category:'movement',subCategory:'translation'},
    {type:'strafeR',category:'movement',subCategory:'translation'},
    {type:'evade',category:'movement',subCategory:'evasion'},
    {type:'turnL',category:'orientation',subCategory:'turn'},
    {type:'turnR',category:'orientation',subCategory:'turn'},
    {type:'aim',category:'orientation',subCategory:'aim'},
    {type:'weapon1',category:'weapon',subCategory:'slot'},
    {type:'weapon2',category:'weapon',subCategory:'slot'},
    {type:'flagOn',category:'state',subCategory:'flag'},
    {type:'flagOff',category:'state',subCategory:'flag'},
    {type:'timerStart',category:'state',subCategory:'timer'},
    {type:'wait',category:'state',subCategory:'wait'},
    {type:'enemyFront',category:'sensor',subCategory:'geometry'},
    {type:'enemyLeft',category:'sensor',subCategory:'geometry'},
    {type:'enemyRight',category:'sensor',subCategory:'geometry'},
    {type:'enemyFacingMe',category:'sensor',subCategory:'geometry'},
    {type:'behindEnemy',category:'sensor',subCategory:'geometry'},
    {type:'enemyNear',category:'sensor',subCategory:'distance'},
    {type:'enemyFar',category:'sensor',subCategory:'distance'},
    {type:'enemyWithin100',category:'sensor',subCategory:'distance'},
    {type:'enemyWithin200',category:'sensor',subCategory:'distance'},
    {type:'enemyWithin300',category:'sensor',subCategory:'distance'},
    {type:'enemyInNarrowFov',category:'sensor',subCategory:'detection'},
    {type:'enemyInMediumFov',category:'sensor',subCategory:'detection'},
    {type:'enemyInWideFov',category:'sensor',subCategory:'detection'},
    {type:'bulletNear',category:'sensor',subCategory:'threat'},
    {type:'bulletLeft',category:'sensor',subCategory:'threat'},
    {type:'bulletRight',category:'sensor',subCategory:'threat'},
    {type:'lostEnemy',category:'sensor',subCategory:'tracking'},
    {type:'wallNear',category:'environment',subCategory:'wall'},
    {type:'hpLow',category:'self',subCategory:'health'},
    {type:'hitRecent',category:'self',subCategory:'damage'},
    {type:'flagSet',category:'state',subCategory:'flag'},
    {type:'timer2s',category:'state',subCategory:'timer'},
    {type:'canShoot',category:'weapon',subCategory:'availability'},
    {type:'weapon1Ammo',category:'weapon',subCategory:'availability'},
    {type:'weapon2Ammo',category:'weapon',subCategory:'availability'}
  ];
  const registry=new Map();
  function tupleFor(type){return typeof chipTypes!=='undefined'?chipTypes.find(x=>x[0]===type):null;}
  function inferKind(type){return tupleFor(type)?.[2]||null;}
  function registerChipDefinition(def){
    if(!def||!def.type)throw new Error('chip definition requires type');
    const old=registry.get(def.type)||{};
    const kind=def.kind||old.kind||inferKind(def.type);
    const meta={...old,...def,kind};
    if(!meta.kind)throw new Error('chip definition requires kind for '+def.type);
    meta.capabilities=Array.isArray(meta.capabilities)?meta.capabilities.slice():(meta.kind==='cond'?['sensor']:[meta.category].filter(x=>['movement','orientation','weapon'].includes(x)));
    registry.set(meta.type,meta);
    if(typeof chipTypes!=='undefined'&&!tupleFor(meta.type)&&meta.label)chipTypes.push([meta.type,meta.label,meta.kind]);
    return meta;
  }
  for(const d of defs){const t=tupleFor(d.type);if(t)registerChipDefinition({...d,label:t[1],kind:t[2]});}
  if(typeof chipTypes!=='undefined')for(const t of chipTypes)if(!registry.has(t[0]))registerChipDefinition({type:t[0],label:t[1],kind:t[2],category:t[2]==='cond'?'sensor':'state',subCategory:'other'});
  function chipDefinition(type){return registry.get(type)||null;}
  function chipTypesByKind(kind){return [...registry.values()].filter(d=>d.kind===kind).map(d=>d.type);}
  function chipTypesByCategory(category,kind=null){return [...registry.values()].filter(d=>d.category===category&&(!kind||d.kind===kind)).map(d=>d.type);}
  function compatibleChipTypes(type){
    const m=chipDefinition(type);if(!m)return[];
    let xs=[...registry.values()].filter(d=>d.type!==type&&d.kind===m.kind&&d.category===m.category&&d.subCategory===m.subCategory);
    if(!xs.length)xs=[...registry.values()].filter(d=>d.type!==type&&d.kind===m.kind&&d.category===m.category);
    return xs.map(d=>d.type);
  }
  function chipProvides(type,capability){return !!chipDefinition(type)?.capabilities?.includes(capability);}
  window.__chipCatalog={version:'chip-catalog-v0.1',registry,registerChipDefinition,chipDefinition,chipTypesByKind,chipTypesByCategory,compatibleChipTypes,chipProvides};
  window.registerChipDefinition=registerChipDefinition;
  window.chipDefinition=chipDefinition;
  window.chipTypesByKind=chipTypesByKind;
  window.chipTypesByCategory=chipTypesByCategory;
  window.compatibleChipTypes=compatibleChipTypes;
  window.chipProvides=chipProvides;
})();