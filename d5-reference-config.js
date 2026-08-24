// Shared reference definition for D4/D5 and production reproducibility checks.
(function installD5ReferenceConfig(){
  const VERSION='d5-reference-config-v0.2';
  const MASTER_SEEDS=[26082407,26082507,26082607,26082707,26082807];
  // The user actually completed the 3-run D5 reproducibility check with these seeds.
  // Production sampling is therefore limited to this validated subset.
  const VALIDATED_MASTER_SEEDS=MASTER_SEEDS.slice(0,3);
  const VALIDATED={cpuClass:'standard',cpuLimit:18,cpuDecisionMs:120,chassisA:'standard',chassisB:'standard',generations:20};
  const clone=p=>p.map(c=>c?{...c}:null);

  function seedA(){const p=Array(36).fill(null);p[1]={type:'enemyInWideFov',kind:'cond',yes:'D',no:'R'};p[2]={type:'turnR',kind:'action',next:'L'};p[7]={type:'aim',kind:'action',next:'R'};p[8]={type:'canShoot',kind:'cond',yes:'D',no:'L'};p[13]={type:'forward',kind:'action',next:'U'};p[14]={type:'weapon1',kind:'action',next:'L'};return p;}
  function seedB(){const p=Array(36).fill(null);p[1]={type:'enemyInWideFov',kind:'cond',yes:'D',no:'R'};p[2]={type:'turnL',kind:'action',next:'L'};p[7]={type:'bulletNear',kind:'cond',yes:'R',no:'D'};p[8]={type:'evade',kind:'action',next:'L'};p[13]={type:'aim',kind:'action',next:'R'};p[14]={type:'canShoot',kind:'cond',yes:'R',no:'U'};p[15]={type:'weapon1',kind:'action',next:'L'};return p;}
  function seedC(){const p=Array(36).fill(null);p[1]={type:'enemyInMediumFov',kind:'cond',yes:'D',no:'R'};p[2]={type:'turnR',kind:'action',next:'L'};p[7]={type:'enemyNear',kind:'cond',yes:'R',no:'D'};p[8]={type:'weapon2',kind:'action',next:'L'};p[13]={type:'aim',kind:'action',next:'R'};p[14]={type:'weapon1',kind:'action',next:'L'};return p;}
  function baselineTail(){return[seedA(),seedB(),seedA(),seedB(),seedC()].map(clone);}

  const BASELINE_MARKER="function baselines(){const ps=[activeSeed(),handDesignedChampion('A'),handDesignedChampion('B'),...strategicSeeds()],ws=[['rifle','rapid'],['rifle','mine'],['heavy','rapid'],['burst','killer'],['rapid','mine'],['heavy','killer']];return ps.map((p,i)=>({id:'base-'+i,program:clone(p),hash:hash(p),weapons:ws[i%ws.length].slice(),cluster:null,eval:null,engagement:null}));}";
  const BASELINE_REPLACEMENT="function baselines(){const ref=window.__D5ReferenceConfig;if(!ref||!String(ref.VERSION||'').startsWith('d5-reference-config-v0.'))throw new Error('D5 reference config missing');const ps=[activeSeed(),...ref.baselineTail()],ws=[['rifle','rapid'],['rifle','mine'],['heavy','rapid'],['burst','killer'],['rapid','mine'],['heavy','killer']];return ps.map((p,i)=>({id:'base-'+i,program:clone(p),hash:hash(p),weapons:ws[i%ws.length].slice(),cluster:null,eval:null,engagement:null}));}";
  const MASTER_MARKER='const r=rngFactory(26082407),bs=baselines();';
  const VERSION_MARKER="const VERSION='phase-d4-checkpoint-test-v0.1';";

  function patchD4Source(src,masterSeed=MASTER_SEEDS[0],versionLabel){
    if(typeof src!=='string'||!src.includes(VERSION_MARKER)||!src.includes(MASTER_MARKER)||!src.includes(BASELINE_MARKER))throw new Error('D4 reference source mismatch');
    const seed=(Number(masterSeed)>>>0);
    const label=versionLabel||`phase-d5-reference-seed-${seed}`;
    return src.replace(VERSION_MARKER,`const VERSION='${label}';`).replace(BASELINE_MARKER,BASELINE_REPLACEMENT).replace(MASTER_MARKER,`const r=rngFactory(${seed}),bs=baselines();`);
  }

  window.__D5ReferenceConfig={VERSION,MASTER_SEEDS:MASTER_SEEDS.slice(),VALIDATED_MASTER_SEEDS:VALIDATED_MASTER_SEEDS.slice(),VALIDATED:{...VALIDATED},defaultMasterSeed:MASTER_SEEDS[0],seedA,seedB,seedC,baselineTail,patchD4Source};
})();
