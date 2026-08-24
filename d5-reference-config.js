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
  const VALIDATION_SEED_MARKER="const validationPanel=[bs[0],bs[1],bs[2],bs[3]],validationSeeds=[2210000003,2210010049,2210020081,2210030127];";
  const VALIDATION_SEED_REPLACEMENT="const validationPanel=[bs[0],bs[1],bs[2],bs[3]],validationSeeds=[2210000003,2210010049,2210020081,2210030127],validationExtraSeeds=[2310000019,2310010057,2310020099,2310030143];";
  const VALIDATION_CANDIDATE_MARKER="const candidateVals=[];\n          for(const x of leaders){const metrics=evaluate(x,validationPanel,validationSeeds,c),snapshot=snap(x);if(hash(snapshot.program)!==snapshot.hash)c.checkpointHashViolations++;candidateVals.push({snapshot,metrics});}";
  const VALIDATION_CANDIDATE_REPLACEMENT="const heldoutLeaders=[];\n          const heldoutBetter=(a,b)=>{const A=heldMap.get(a.id)||{},B=heldMap.get(b.id)||{},fa=engageFeasible(A),fb=engageFeasible(B);if(fa!==fb)return fa?-1:1;if((A.wins||0)!==(B.wins||0))return (B.wins||0)-(A.wins||0);if((A.resolved||0)!==(B.resolved||0))return (B.resolved||0)-(A.resolved||0);if((A.nonCombatGames||0)!==(B.nonCombatGames||0))return (A.nonCombatGames||0)-(B.nonCombatGames||0);if((A.damage||0)!==(B.damage||0))return (B.damage||0)-(A.damage||0);if((A.margin||0)!==(B.margin||0))return (B.margin||0)-(A.margin||0);return a.hash<b.hash?-1:a.hash>b.hash?1:0;};\n          for(let k=0;k<K;k++){const ranked=gs[k].slice().sort(heldoutBetter);for(const x of ranked.slice(0,DEEP_PER_CLUSTER))heldoutLeaders.push(x);}\n          const initialVals=[];\n          for(const x of heldoutLeaders){const metrics=evaluate(x,validationPanel,validationSeeds,c),snapshot=snap(x);if(hash(snapshot.program)!==snapshot.hash)c.checkpointHashViolations++;initialVals.push({source:x,snapshot,metrics});}\n          initialVals.sort((a,b)=>validationBetter(a,b)?-1:validationBetter(b,a)?1:0);\n          const initialBestWins=initialVals[0]?.metrics?.wins||0,contenders=initialVals.filter(v=>initialBestWins-(v.metrics?.wins||0)<=1),candidateVals=[];\n          for(const v of contenders){const extra=evaluate(v.source,validationPanel,validationExtraSeeds,c),metrics=aggregateMetrics([v.metrics,extra]);candidateVals.push({snapshot:v.snapshot,metrics});}";
  const CHECKPOINT_RULE_MARKER="checkpointRule:'Every 5 generations, select one immutable checkpoint champion by fixed validation lexicographic order: wins > damage > resolved > margin. Final checkpoint is the best validation champion across checkpoints.'";
  const CHECKPOINT_RULE_REPLACEMENT="checkpointRule:'Every 5 generations, evaluate all 300 individuals on held-out conditions, promote the strongest held-out individuals per behavior cluster to Validation, run an initial 8-battle Validation, then give a disjoint extra 8-battle Validation only to contenders within one win of the initial leader. Select the immutable checkpoint champion by combined Validation order: wins > resolved > fewer non-combat games > damage > margin. Final checkpoint is the best Validation champion across checkpoints.'";

  function patchD4Source(src,masterSeed=MASTER_SEEDS[0],versionLabel){
    if(typeof src!=='string'||!src.includes(VERSION_MARKER)||!src.includes(MASTER_MARKER)||!src.includes(BASELINE_MARKER)||!src.includes(VALIDATION_SEED_MARKER)||!src.includes(VALIDATION_CANDIDATE_MARKER))throw new Error('D4 reference source mismatch');
    const seed=(Number(masterSeed)>>>0);
    const label=versionLabel||`phase-d5-reference-seed-${seed}`;
    let out=src.replace(VERSION_MARKER,`const VERSION='${label}';`).replace(BASELINE_MARKER,BASELINE_REPLACEMENT).replace(MASTER_MARKER,`const r=rngFactory(${seed}),bs=baselines();`).replace(VALIDATION_SEED_MARKER,VALIDATION_SEED_REPLACEMENT).replace(VALIDATION_CANDIDATE_MARKER,VALIDATION_CANDIDATE_REPLACEMENT);
    if(out.includes(CHECKPOINT_RULE_MARKER))out=out.replace(CHECKPOINT_RULE_MARKER,CHECKPOINT_RULE_REPLACEMENT);
    return out;
  }

  window.__D5ReferenceConfig={VERSION,MASTER_SEEDS:MASTER_SEEDS.slice(),VALIDATED_MASTER_SEEDS:VALIDATED_MASTER_SEEDS.slice(),VALIDATED:{...VALIDATED},defaultMasterSeed:MASTER_SEEDS[0],seedA,seedB,seedC,baselineTail,patchD4Source,promotionRuleVersion:'heldout-cluster-promotion-v1',validationRuleVersion:'adaptive-validation-8plus8-v1'};
})();
