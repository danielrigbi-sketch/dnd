// js/mapEngine.js — Tactical Battlefield v128
// Complete real-time tactical map for CritRoll D&D
// Self-contained: no external render deps, uses injected Firebase helpers
// SC: v128 — NPC tokens use type-colour ring from monsters.js typeColor map
// =====================================================================

import { typeColor } from './monsters.js';

// ── Constants ────────────────────────────────────────────────────────
const FT_PER_SQ   = 5;
const MAP_W_DEFAULT = 30;   // default grid columns when none specified
const MAP_H_DEFAULT = 20;   // default grid rows when none specified
const DEF_PPS     = 64;          // default pixels-per-square
const MIN_PPS     = 16;
const MAX_PPS     = 200;
const FOW_ALPHA   = 0.88;
const GRID_NORMAL   = 'rgba(200,200,200,0.18)';
const GRID_LOCKED   = 'rgba(20,20,20,0.45)';   // thin black after approval
const GRID_CALIB    = 'rgba(255,220,60,0.50)';
const GRID_PHANTOM  = 'rgba(50,230,100,0.75)';  // vivid green phantom
const OBS_FILL    = 'rgba(160,0,0,0.55)';
const TRIG_FILL   = 'rgba(255,180,0,0.40)';
const TRIG_FIRED  = 'rgba(255,80,0,0.70)';
const PATH_STROKE = 'rgba(80,200,255,0.85)';
const REVEAL_FILL = 'rgba(0,200,100,0.28)';
const AOE_COLS = {
  circle:'rgba(255,70,0,0.32)', cone:'rgba(255,200,0,0.32)',
  cube:'rgba(0,140,255,0.32)',  line:'rgba(200,0,220,0.45)',
};
const STS_ICON = {
  Poisoned:'☠',Charmed:'♥',Unconscious:'💤',Frightened:'😱',
  Paralyzed:'⚡',Restrained:'⛓',Blinded:'🚫',Prone:'⬇',Stunned:'💫',
  Concentrating:'🔮',
};


// Lightweight debounce: delays fn until after 'ms' ms of inactivity.
function _debounce(fn, ms) {
    let t = null;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

function ck(gx,gy){ return `${Math.floor(gx)}_${Math.floor(gy)}`; }
function kp(k){ const[x,y]=k.split('_').map(Number); return{gx:x,gy:y}; }
function cheb(ax,ay,bx,by){ return Math.max(Math.abs(ax-bx),Math.abs(ay-by)); }
function lerp(a,b,t){ return a+(b-a)*t; }

// ── MapEngine class ──────────────────────────────────────────────────
export class MapEngine {
  constructor(canvas, fowCanvas, opts={}) {
    this.localOnly  = opts.localOnly || false; // wizard: no db needed
    this.cv  = canvas;
    this.ctx = canvas.getContext('2d');
    this.fw  = fowCanvas;
    this.fc  = fowCanvas.getContext('2d');

    this.cName      = opts.cName      || '';
    this.userRole   = opts.userRole   || 'player';
    this.activeRoom = opts.activeRoom || 'public';
    this.isMuted    = false;
    this.db         = null;   // set via setupFirebase()

    // View transform
    this.vx=0; this.vy=0; this.vs=1;

    // Firebase-synced state
    this.S = {
      cfg: { bgUrl:'', pps:DEF_PPS, ox:0, oy:0, locked:false, mapW:30, mapH:20 },
      atmosphere: { weather:'none', ambientLight:'bright', globalDarkvision:0 },
      tokens:    {},  // {cName:{gx,gy,usedMv}}
      fog:       {},  // {ck: true}  = revealed
      obstacles: {},  // {ck: true}
      triggers:  {},  // {ck:{label,fired}}
      players:   {},  // mirrored from app
      scenes:    {},
      activeScene: 'default',
    };

    // Local only
    this.L = {
      mode:'view',  // view|obstacle|trigger|fogReveal|fogHide|ruler|aoe|calibrate
      tool:'paint', // paint|erase
      aoeShape:'circle', aoeR:20,
      rulerA: null, rulerB: null,
      drag: null,   // {cName,startGX,startGY,curGX,curGY,path[]}
      mw:{x:0,y:0}, ms:{x:0,y:0},
      painting:false,
      imgCache:{},
      bg:null, bgLoading:false,
      ati:null, sc:[],   // activeTurnIndex, sortedCombatants
      dirty:true, raf:null,
      pan:{on:false,sx:0,sy:0,vx0:0,vy0:0},
      firedLocal: new Set(),
      placing: null,  // cName being placed on map by DM
    };

    this._evs = {};
    this._unsubs = [];

    // Debounced Firebase writes for high-frequency painting operations
    this._debouncedWriteObstacle = _debounce((key, val) => {
        if (this.db) this.db.setObstacle(this.activeRoom, this.S.activeScene, key, val);
    }, 50);
    this._debouncedWriteFog = _debounce((gx, gy, reveal) => {
        if (this.db) {
            if (reveal) this.db.revealFog(this.activeRoom, this.S.activeScene, gx, gy, 1);
            else        this.db.hideFog(this.activeRoom, this.S.activeScene, gx, gy);
        }
    }, 50);
    this._debouncedSaveGridCfg = _debounce(() => {
        if (this.db) this.db.setMapCfg(this.activeRoom, this.S.cfg);
    }, 300);

    this._bindCanvas();
    this._loop();
  }

  // ── Lifecycle ───────────────────────────────────────────────────────
  destroy(){
    cancelAnimationFrame(this.L.raf);
    Object.entries(this._evs).forEach(([ev,fn])=>this.cv.removeEventListener(ev,fn));
    this._unsubs.forEach(u=>u());
  }

  setActiveTurn(idx, sc){ this.L.ati=idx; this.L.sc=sc||[]; this._dirty(); }
  setPlayers(p){
    const newKeys=Object.keys(p||{}).sort().join(',');
    const oldKeys=Object.keys(this.S.players).sort().join(',');
    this.S.players=p||{};
    this._dirty();
    // Only rebuild the token roster DOM when membership changes
    if(newKeys!==oldKeys) this._updateDashTokenList();
  }
  setMuted(v){ this.isMuted=v; }
  _dirty(){ this.L.dirty=true; }

  // ── Firebase setup ──────────────────────────────────────────────────
  setupFirebase(db){
    this.db = db;
    this._unsubs.forEach(u=>u());
    this._unsubs = [];
    const r = this.activeRoom, sc = this.S.activeScene;

    this._unsubs.push(
      db.listenMapCfg(r, cfg=>{
        if(!cfg) return;
        const wasUrl = this.S.cfg.bgUrl;
        this.S.cfg = {...this.S.cfg,...cfg};
        if(cfg.bgUrl && cfg.bgUrl!==wasUrl) this._loadBg(cfg.bgUrl);
        this._dirty();
      }),
      db.listenMapTokens(r, tks=>{
        this.S.tokens = tks||{};
        this._dirty();
      }),
      db.listenFog(r, sc, fog=>{
        this.S.fog = fog||{}; this._dirty();
      }),
      db.listenObstacles(r, sc, obs=>{
        this.S.obstacles = obs||{}; this._dirty();
      }),
      db.listenTriggers(r, sc, trg=>{
        this.S.triggers = trg||{}; this._dirty();
      }),
      db.listenActiveScene(r, sid=>{
        if(sid && sid!==this.S.activeScene) this._switchScene(sid);
      }),
    );
  }

  _switchScene(sid){
    this._unsubs.forEach(u=>u()); this._unsubs=[];
    this.S.activeScene=sid;
    this.S.fog={}; this.S.obstacles={}; this.S.triggers={};
    this.L.firedLocal.clear();
    if(this.db) this.setupFirebase(this.db);
    this._dirty();
  }

  // ── Render loop ─────────────────────────────────────────────────────
  _loop(){
    const tick=()=>{
      if(this.L.dirty){ this._render(); this.L.dirty=false; }
      this.L.raf=requestAnimationFrame(tick);
    };
    this.L.raf=requestAnimationFrame(tick);
  }

  _render(){
    const {ctx,cv,fw,fc}=this;
    const W=cv.width, H=cv.height;
    ctx.clearRect(0,0,W,H);

    ctx.save();
    ctx.translate(this.vx,this.vy);
    ctx.scale(this.vs,this.vs);

    this._rBg();
    this._rGrid();
    this._rObstacles();
    if(this.userRole==='dm') this._rTriggers();
    this._rTokens();
    this._rPath();
    this._rRuler();
    this._rAoe();
    this._rPhantomGrid(); // top layer in world space

    ctx.restore();

    // FOW (screen-space composite)
    const _m=this.L.mode;
    if(_m==='wizFog'||_m==='wizFogHide') this._rWizFog();
    else if(this.userRole!=='dm') this._rFow();
    else this._rFowDM();

    // Weather overlay (screen-space)
    this._rWeather();
    // HUD (screen-space)
    this._rHUD();
    this._rModeHUD();
  }

  // ── Background ──────────────────────────────────────────────────────
  // Returns the pixel dimensions the bg image should be drawn at in phantom
  // mode: fit-inside the canvas at scale=1, preserving aspect ratio.
  _getBgFit(){
    const cw=this.cv.width, ch=this.cv.height;
    if(!this.L.bg) return {w:cw,h:ch};
    const nw=this.L.bg.naturalWidth||this.L.bg.width||cw;
    const nh=this.L.bg.naturalHeight||this.L.bg.height||ch;
    const scale=Math.min(cw/nw, ch/nh, 1); // never upscale beyond canvas
    return {w:Math.round(nw*scale), h:Math.round(nh*scale)};
  }

  _rBg(){
    const {ctx}=this, {pps,ox,oy,mapW:mw,mapH:mh}=this.S.cfg;

    if(this.L.mode==='phantom'){
      // Phantom mode: image at fixed canvas-fitted size so grid calibration
      // doesn't scale the image — only grid density changes with pps.
      const fit=this._getBgFit();
      // Dark background behind image
      ctx.fillStyle='#0d0a1e';
      ctx.fillRect(ox,oy,fit.w,fit.h);
      if(this.L.bg) ctx.drawImage(this.L.bg,ox,oy,fit.w,fit.h);
      return;
    }

    const W=(mw||MAP_W_DEFAULT)*pps, H=(mh||MAP_H_DEFAULT)*pps;
    // Checkerboard
    for(let gx=0;gx<(mw||MAP_W_DEFAULT);gx++){
      for(let gy=0;gy<(mh||MAP_H_DEFAULT);gy++){
        ctx.fillStyle=(gx+gy)%2===0?'#1a1a2e':'#16213e';
        ctx.fillRect(ox+gx*pps,oy+gy*pps,pps,pps);
      }
    }
    if(this.L.bg) ctx.drawImage(this.L.bg,ox,oy,W,H);
  }

  // ── Grid ────────────────────────────────────────────────────────────
  _rGrid(){
    if(this.L.mode==='phantom') return; // phantom drawn separately as top layer
    const {ctx}=this, {pps,ox,oy,mapW:mw,mapH:mh,locked}=this.S.cfg;
    const m=this.L.mode;
    ctx.strokeStyle = m==='calibrate' ? GRID_CALIB : locked ? GRID_LOCKED : GRID_NORMAL;
    ctx.lineWidth = (m==='calibrate'?1.5:0.6)/this.vs;
    ctx.beginPath();
    for(let x=0;x<=(mw||MAP_W_DEFAULT);x++){
      const px=ox+x*pps;
      ctx.moveTo(px,oy); ctx.lineTo(px,oy+(mh||MAP_H_DEFAULT)*pps);
    }
    for(let y=0;y<=(mh||MAP_H_DEFAULT);y++){
      const py=oy+y*pps;
      ctx.moveTo(ox,py); ctx.lineTo(ox+(mw||MAP_W_DEFAULT)*pps,py);
    }
    ctx.stroke();
    // In calibrate mode show corner handles
    if(m==='calibrate'){
      ctx.fillStyle=GRID_CALIB;
      for(let x=0;x<=(mw||MAP_W_DEFAULT);x+=5){
        for(let y=0;y<=(mh||MAP_H_DEFAULT);y+=5){
          ctx.fillRect(ox+x*pps-3/this.vs,oy+y*pps-3/this.vs,6/this.vs,6/this.vs);
        }
      }
    }
  }

  // ── Obstacles ───────────────────────────────────────────────────────
  _rObstacles(){
    const {ctx}=this, {pps,ox,oy}=this.S.cfg;
    Object.keys(this.S.obstacles).forEach(k=>{
      const {gx,gy}=kp(k);
      const px=ox+gx*pps, py=oy+gy*pps;
      ctx.fillStyle=OBS_FILL;
      ctx.fillRect(px,py,pps,pps);
      ctx.font=`${pps*0.45}px serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('🧱',px+pps/2,py+pps/2);
    });
  }

  // ── Triggers (DM only) ───────────────────────────────────────────────
  _rTriggers(){
    const {ctx}=this, {pps,ox,oy}=this.S.cfg;
    Object.entries(this.S.triggers).forEach(([k,t])=>{
      const {gx,gy}=kp(k);
      const px=ox+gx*pps, py=oy+gy*pps;
      ctx.fillStyle=t.fired?TRIG_FIRED:TRIG_FILL;
      ctx.fillRect(px,py,pps,pps);
      ctx.font=`${pps*0.4}px serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('⚠',px+pps/2,py+pps/2);
      // Label
      if(t.label){
        ctx.fillStyle='rgba(255,220,0,0.9)';
        ctx.font=`bold ${Math.max(8,pps*0.15)}px Arial`;
        ctx.fillText(t.label,px+pps/2,py+pps*0.88);
      }
    });
  }

  // ── Tokens ───────────────────────────────────────────────────────────
  _rTokens(){
    const activeName = this.L.sc[this.L.ati]?.name;
    Object.entries(this.S.tokens).forEach(([cn,tk])=>{
      if(!tk||tk.gx==null) return;
      if(this.L.drag?.cName===cn) return; // drawn separately (ghost)
      const {pps,ox,oy}=this.S.cfg;
      this._rToken(cn,tk,ox+tk.gx*pps,oy+tk.gy*pps,pps,cn===activeName,false);
    });
    // Ghost while dragging
    if(this.L.drag){
      const dt=this.L.drag, tk=this.S.tokens[dt.cName];
      if(tk){
        const {pps,ox,oy}=this.S.cfg;
        this.ctx.globalAlpha=0.70;
        this._rToken(dt.cName,tk,ox+dt.curGX*pps,oy+dt.curGY*pps,pps,false,true);
        this.ctx.globalAlpha=1;
      }
    }
    // Placing token cursor
    if(this.L.placing){
      const {pps,ox,oy}=this.S.cfg;
      const {x:wx,y:wy}=this.L.mw;
      const {gx,gy}=this._wg(wx,wy);
      this.ctx.globalAlpha=0.55;
      const pl=this.S.players[this.L.placing];
      this.ctx.fillStyle=pl?.pColor||'#3498db';
      this.ctx.fillRect(ox+gx*pps,oy+gy*pps,pps,pps);
      this.ctx.globalAlpha=1;
    }
  }

  _rToken(cn,tk,px,py,size,isActive,isGhost){
    const {ctx}=this;
    const pl=this.S.players[cn]||{};
    // SC: NPCs get their monster-type ring colour; fallback to pColor or default blue
    const isNPC = pl.userRole === 'npc';
    const monType = pl.monsterType || null;
    const col = (isNPC && monType && typeColor[monType]) ? typeColor[monType]
               : (pl.pColor || '#3498db');
    const portrait=pl.portrait;
    const statuses=pl.statuses||[];
    const isDying=(pl.hp||0)<=0;
    const isConc=pl.concentrating;
    const cx=px+size/2, cy=py+size/2, r=size*0.42;

    // Active glow
    if(isActive){
      ctx.save();
      ctx.shadowColor='#f1c40f'; ctx.shadowBlur=size*0.6;
      ctx.beginPath(); ctx.arc(cx,cy,r+5/this.vs,0,Math.PI*2);
      ctx.fillStyle='rgba(241,196,15,0.25)'; ctx.fill();
      ctx.restore();
      // Pulsing ring
      ctx.beginPath(); ctx.arc(cx,cy,r+4/this.vs,0,Math.PI*2);
      ctx.strokeStyle='rgba(241,196,15,0.9)';
      ctx.lineWidth=2.5/this.vs; ctx.stroke();
    }

    // Clip circle for portrait
    ctx.save();
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.clip();
    if(portrait&&this.L.imgCache[portrait]){
      ctx.drawImage(this.L.imgCache[portrait],px,py,size,size);
    } else {
      ctx.fillStyle=col; ctx.fillRect(px,py,size,size);
      if(portrait&&!this.L.imgCache['__L'+portrait]){
        this.L.imgCache['__L'+portrait]=true;
        const img=new Image(); img.crossOrigin='anonymous';
        img.onload=()=>{ this.L.imgCache[portrait]=img; this._dirty(); };
        img.onerror=()=>{ this.L.imgCache[portrait]=false; };
        img.src=portrait;
      }
    }
    // Death overlay
    if(isDying){
      ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(px,py,size,size);
      ctx.font=`${size*0.5}px serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('💀',cx,cy);
    }
    ctx.restore();

    // Border ring
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
    ctx.strokeStyle=isDying?'#e74c3c':isActive?'#f1c40f':col;
    ctx.lineWidth=(isActive?3:2)/this.vs; ctx.stroke();

    // Name tag
    const tagH=size*0.22;
    ctx.fillStyle='rgba(0,0,0,0.75)';
    ctx.fillRect(px,py+size-tagH,size,tagH);
    ctx.fillStyle='white';
    ctx.font=`bold ${size*0.14}px Arial`;
    ctx.textAlign='center'; ctx.textBaseline='bottom';
    const label=cn.length>9?cn.slice(0,8)+'…':cn;
    ctx.fillText(label,cx,py+size-1/this.vs);

    // HP bar
    if(pl.maxHp){
      const pct=Math.max(0,(pl.hp||0)/pl.maxHp);
      const bw=size*0.84, bh=4/this.vs, bx=px+(size-bw)/2, by=py+size+3/this.vs;
      ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(bx,by,bw,bh);
      ctx.fillStyle=pct>0.5?'#2ecc71':pct>0.25?'#f39c12':'#e74c3c';
      ctx.fillRect(bx,by,bw*pct,bh);
    }

    // Status icons (top-right corner)
    const all=[...statuses]; if(isConc) all.push('Concentrating');
    all.slice(0,6).forEach((s,i)=>{
      const sz=size*0.21, col=Math.floor(i/2), row=i%2;
      const ix=px+size-sz*(col+1), iy=py+sz*row;
      ctx.font=`${sz*0.92}px serif`;
      ctx.textAlign='right'; ctx.textBaseline='top';
      ctx.fillText(STS_ICON[s]||'❓',ix+sz,iy);
    });
  }

  // ── Path preview ─────────────────────────────────────────────────────
  _rPath(){
    const dt=this.L.drag;
    if(!dt||!dt.path||dt.path.length<2) return;
    const {ctx}=this, {pps,ox,oy}=this.S.cfg;
    ctx.save();
    ctx.strokeStyle=PATH_STROKE; ctx.lineWidth=3/this.vs;
    ctx.setLineDash([8/this.vs,4/this.vs]);
    ctx.lineJoin='round'; ctx.lineCap='round';
    ctx.beginPath();
    dt.path.forEach(([gx,gy],i)=>{
      const wx=ox+(gx+0.5)*pps, wy=oy+(gy+0.5)*pps;
      i===0?ctx.moveTo(wx,wy):ctx.lineTo(wx,wy);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    // Squares count label at destination
    const last=dt.path[dt.path.length-1];
    const sq=dt.path.length-1;
    const ft=sq*FT_PER_SQ;
    const wx=ox+(last[0]+0.5)*pps, wy=oy+(last[1]+0.5)*pps;
    ctx.fillStyle='rgba(0,0,0,0.7)';
    ctx.fillRect(wx-22/this.vs,wy-16/this.vs,44/this.vs,16/this.vs);
    ctx.fillStyle='#80cfff'; ctx.font=`bold ${12/this.vs}px Arial`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(`${ft}ft`,wx,wy-8/this.vs);
    ctx.restore();
  }

  // ── FOW (player view) ─────────────────────────────────────────────────
  _rFow(){
    const {fw,fc,cv}=this;
    const W=cv.width, H=cv.height;
    if(fw.width!==W||fw.height!==H){ fw.width=W; fw.height=H; }
    fc.clearRect(0,0,W,H);
    // Dark fill
    fc.fillStyle=`rgba(0,0,0,${FOW_ALPHA})`;
    fc.fillRect(0,0,W,H);
    // Punch revealed holes
    fc.save();
    fc.globalCompositeOperation='destination-out';
    fc.translate(this.vx,this.vy); fc.scale(this.vs,this.vs);
    const {pps,ox,oy}=this.S.cfg;
    // Revealed cells
    Object.keys(this.S.fog).forEach(k=>{
      const {gx,gy}=kp(k);
      fc.fillStyle='rgba(255,255,255,1)';
      fc.fillRect(ox+gx*pps-1,oy+gy*pps-1,pps+2,pps+2);
    });
    // Own token vision radius (always visible)
    const myTk=this.S.tokens[this.cName];
    if(myTk){
      const vr=this._visionR(this.cName);
      for(let dx=-vr;dx<=vr;dx++) for(let dy=-vr;dy<=vr;dy++){
        if(cheb(0,0,dx,dy)<=vr){
          fc.fillStyle='rgba(255,255,255,1)';
          fc.fillRect(ox+(myTk.gx+dx)*pps-1,oy+(myTk.gy+dy)*pps-1,pps+2,pps+2);
        }
      }
    }
    fc.restore();
    this.ctx.drawImage(fw,0,0);
  }


  // ── Phantom green grid — wizard step 2 ──────────────────────────────
  // Rendered as the top layer in world space (inside save/restore block)
  _rPhantomGrid(){
    if(this.L.mode!=='phantom') return;
    const {ctx}=this, {pps,ox,oy}=this.S.cfg;

    // Derive tile count from image's fixed fit size divided by current pps.
    // This means +/- shows more/fewer tiles WITHOUT moving the image.
    const fit=this._getBgFit();
    const cols=Math.max(1,Math.floor(fit.w/pps));
    const rows=Math.max(1,Math.floor(fit.h/pps));

    // Keep mapW/mapH in sync so other steps use the right counts.
    this.S.cfg.mapW=cols;
    this.S.cfg.mapH=rows;

    // Semi-transparent tint over image so grid is visible
    ctx.fillStyle='rgba(0,0,0,0.18)';
    ctx.fillRect(ox,oy,cols*pps,rows*pps);
    // Vivid green grid lines
    ctx.save();
    ctx.strokeStyle=GRID_PHANTOM;
    ctx.lineWidth=2/this.vs;
    ctx.shadowColor='rgba(40,255,90,0.55)';
    ctx.shadowBlur=6/this.vs;
    ctx.beginPath();
    for(let x=0;x<=cols;x++){ const px=ox+x*pps; ctx.moveTo(px,oy); ctx.lineTo(px,oy+rows*pps); }
    for(let y=0;y<=rows;y++){ const py=oy+y*pps; ctx.moveTo(ox,py); ctx.lineTo(ox+cols*pps,py); }
    ctx.stroke();
    // Green dots at every intersection
    ctx.fillStyle='rgba(60,255,110,0.90)';
    ctx.shadowColor='rgba(40,255,90,0.7)';
    ctx.shadowBlur=4/this.vs;
    const dr=2.5/this.vs;
    for(let x=0;x<=cols;x++) for(let y=0;y<=rows;y++){
      ctx.beginPath(); ctx.arc(ox+x*pps,oy+y*pps,dr,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  // ── Wizard fog — thick grey-white covering unrevealed tiles ──────────
  // Rendered in screen space (after ctx.restore) using viewport transform
  _rWizFog(){
    const {ctx}=this, {pps,ox,oy,mapW:mw,mapH:mh}=this.S.cfg;
    ctx.save();
    ctx.translate(this.vx,this.vy);
    ctx.scale(this.vs,this.vs);
    const cols=mw||MAP_W_DEFAULT, rows=mh||MAP_H_DEFAULT;
    for(let gx=0;gx<cols;gx++) for(let gy=0;gy<rows;gy++){
      if(!this.S.fog[ck(gx,gy)]){
        const px=ox+gx*pps, py=oy+gy*pps;
        ctx.fillStyle='rgba(205,212,218,0.94)';
        ctx.fillRect(px,py,pps,pps);
        // Inner vignette for depth
        ctx.fillStyle='rgba(160,168,175,0.30)';
        ctx.fillRect(px+2,py+2,pps-4,pps-4);
      }
    }
    ctx.restore();
  }

  // ── FOW ghost for DM ─────────────────────────────────────────────────
  _rFowDM(){
    const {ctx}=this, {pps,ox,oy,mapW:mw,mapH:mh}=this.S.cfg;
    for(let gx=0;gx<(mw||MAP_W_DEFAULT);gx++) for(let gy=0;gy<(mh||MAP_H_DEFAULT);gy++){
      if(!this.S.fog[ck(gx,gy)]){
        ctx.fillStyle='rgba(0,0,0,0.30)';
        ctx.fillRect(ox+gx*pps,oy+gy*pps,pps,pps);
      }
    }
  }

  // ── Ruler ─────────────────────────────────────────────────────────────
  _rRuler(){
    if(this.L.mode!=='ruler'||!this.L.rulerA) return;
    const {ctx}=this, {pps}=this.S.cfg;
    const a=this.L.rulerA, b=this.L.rulerB||this.L.mw;
    const dx=(b.x-a.x)/pps, dy=(b.y-a.y)/pps;
    const squares=Math.sqrt(dx*dx+dy*dy);
    const ft=Math.round(squares*FT_PER_SQ);
    ctx.save();
    ctx.strokeStyle='rgba(255,255,0,0.9)'; ctx.lineWidth=2/this.vs;
    ctx.setLineDash([8/this.vs,4/this.vs]);
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
    ctx.setLineDash([]);
    // Circle endpoints
    [a,b].forEach(p=>{
      ctx.beginPath(); ctx.arc(p.x,p.y,4/this.vs,0,Math.PI*2);
      ctx.fillStyle='#f1c40f'; ctx.fill();
    });
    // Label
    const mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
    const fs=Math.max(10,13/this.vs);
    ctx.font=`bold ${fs}px Arial`;
    const tw=ctx.measureText(`${ft} ft`).width;
    ctx.fillStyle='rgba(0,0,0,0.75)';
    ctx.fillRect(mx-tw/2-4/this.vs,my-fs-3/this.vs,tw+8/this.vs,fs+6/this.vs);
    ctx.fillStyle='#f1c40f'; ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillText(`${ft} ft`,mx,my+2/this.vs);
    ctx.restore();
  }

  // ── AOE ───────────────────────────────────────────────────────────────
  _rAoe(){
    if(this.L.mode!=='aoe') return;
    const {ctx}=this, {pps}=this.S.cfg;
    const pos=this.L.mw, shape=this.L.aoeShape;
    const rPx=(this.L.aoeR/FT_PER_SQ)*pps;
    const col=AOE_COLS[shape]||AOE_COLS.circle;
    const bord=col.replace(/[\d.]+\)$/,'0.9)');
    ctx.save();
    ctx.fillStyle=col; ctx.strokeStyle=bord; ctx.lineWidth=2/this.vs;
    if(shape==='circle'){
      ctx.beginPath(); ctx.arc(pos.x,pos.y,rPx,0,Math.PI*2); ctx.fill(); ctx.stroke();
    } else if(shape==='cube'){
      ctx.fillRect(pos.x-rPx,pos.y-rPx,rPx*2,rPx*2);
      ctx.strokeRect(pos.x-rPx,pos.y-rPx,rPx*2,rPx*2);
    } else if(shape==='cone'){
      const ang=Math.atan2(pos.y-(this.L.rulerA?.y||pos.y-1),pos.x-(this.L.rulerA?.x||pos.x));
      const origin=this.L.rulerA||{x:pos.x,y:pos.y-rPx};
      ctx.beginPath();
      ctx.moveTo(origin.x,origin.y);
      ctx.arc(origin.x,origin.y,rPx,ang-Math.PI/6,ang+Math.PI/6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if(shape==='line'){
      const lw=pps*0.5;
      ctx.fillRect(pos.x-lw/2,pos.y-rPx,lw,rPx*2);
      ctx.strokeRect(pos.x-lw/2,pos.y-rPx,lw,rPx*2);
    }
    const fs=Math.max(9,11/this.vs);
    ctx.fillStyle='white'; ctx.font=`bold ${fs}px Arial`;
    ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillText(`${this.L.aoeR}ft`,pos.x,pos.y-rPx-3/this.vs);
    ctx.restore();
  }

  // ── Weather/Atmosphere ───────────────────────────────────────────────────
  _rWeather(){
    const a = this.S.atmosphere;
    if(!a || a.weather==='none') {
      // ambient light only
      if(a?.ambientLight==='dark'){
        this.ctx.fillStyle='rgba(0,0,0,0.65)'; this.ctx.fillRect(0,0,this.cv.width,this.cv.height);
      } else if(a?.ambientLight==='dim'){
        this.ctx.fillStyle='rgba(0,0,0,0.32)'; this.ctx.fillRect(0,0,this.cv.width,this.cv.height);
      }
      return;
    }
    const W=this.cv.width, H=this.cv.height, ctx=this.ctx;
    const now=Date.now();
    switch(a.weather){
      case 'light_rain':  this._rRain(ctx,W,H,80,now,0.45,'#88aacc'); break;
      case 'heavy_rain':  this._rRain(ctx,W,H,220,now,0.65,'#667799'); break;
      case 'blizzard':    this._rSnow(ctx,W,H,200,now); break;
      case 'sandstorm':
        ctx.fillStyle='rgba(210,160,60,0.38)'; ctx.fillRect(0,0,W,H);
        this._rRain(ctx,W,H,120,now,0.5,'#c8a055'); break;
      case 'fog':
        ctx.fillStyle='rgba(200,210,220,0.52)'; ctx.fillRect(0,0,W,H); break;
      case 'darkness':
        ctx.fillStyle='rgba(0,0,20,0.80)'; ctx.fillRect(0,0,W,H); break;
    }
    // Ambient light overlay on top
    if(a.ambientLight==='dark'){
      ctx.fillStyle='rgba(0,0,0,0.45)'; ctx.fillRect(0,0,W,H);
    } else if(a.ambientLight==='dim'){
      ctx.fillStyle='rgba(0,0,0,0.22)'; ctx.fillRect(0,0,W,H);
    }
    // Only keep animating for weather with actual animation (rain/snow)
    const _wa=this.S.atmosphere?.weather;
    if(_wa==='light_rain'||_wa==='heavy_rain'||_wa==='blizzard'||_wa==='sandstorm') this._dirty();
  }

  _rRain(ctx,W,H,count,now,alpha,col){
    ctx.save(); ctx.globalAlpha=alpha; ctx.strokeStyle=col;
    ctx.lineWidth=1;
    for(let i=0;i<count;i++){
      const seed=(i*7919+now/16)%1;
      const x=((i*137.5+now*0.08)%W);
      const y=((seed*H+now*0.25)%H);
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x-2,y+12); ctx.stroke();
    }
    ctx.restore();
  }

  _rSnow(ctx,W,H,count,now){
    ctx.save(); ctx.fillStyle='rgba(240,245,255,0.80)';
    for(let i=0;i<count;i++){
      const x=((i*173+now*0.03+Math.sin(now*0.001+i)*20)%W+W)%W;
      const y=((i*11+now*0.06)%H);
      const r=Math.max(1,((i%4)+1)*0.8);
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  // ── HUD ───────────────────────────────────────────────────────────────
  _rHUD(){
    const dt=this.L.drag; if(!dt) return;
    const {ctx,cv}=this;
    const pl=this.S.players[dt.cName]||{};
    const speed=pl.speed||MAP_W_DEFAULT;
    const sq=(dt.path?.length||1)-1;
    const prevUsed=this.S.tokens[dt.cName]?.usedMv||0;
    const used=prevUsed+sq*FT_PER_SQ;
    const rem=Math.max(0,speed-used);
    const pct=rem/speed;
    const over=used>speed;
    const hx=10, hy=cv.height-64;
    ctx.fillStyle='rgba(0,0,0,0.82)';
    ctx.fillRect(hx,hy,230,54);
    ctx.strokeStyle=over?'#e74c3c':'#2ecc71'; ctx.lineWidth=2;
    ctx.strokeRect(hx,hy,230,54);
    ctx.fillStyle='white'; ctx.font='bold 13px Arial';
    ctx.textAlign='left'; ctx.textBaseline='top';
    ctx.fillText(`⚡ ${rem}/${speed} ft remaining`,hx+10,hy+8);
    if(over){ ctx.fillStyle='#e74c3c'; ctx.fillText('Over speed limit!',hx+10,hy+26); }
    ctx.fillStyle='rgba(255,255,255,0.15)';
    ctx.fillRect(hx+10,hy+40,210,8);
    ctx.fillStyle=pct>0.5?'#2ecc71':pct>0.2?'#f39c12':'#e74c3c';
    ctx.fillRect(hx+10,hy+40,210*Math.min(1,rem/speed),8);
  }

  _rModeHUD(){
    if(this.userRole!=='dm') return;
    const {ctx,cv}=this, m=this.L.mode;
    if(m==='view') return;
    const labels={
      obstacle:'🧱 Painting Obstacles',trigger:'⚠️ Placing Triggers',
      fogReveal:'🌟 Revealing Fog',fogHide:'🌑 Hiding Fog',
      ruler:'📏 Measuring',aoe:'💥 AOE Template',calibrate:'🔲 Calibrating Grid',
    };
    const label=labels[m]||m;
    ctx.fillStyle='rgba(0,0,0,0.7)';
    ctx.fillRect(cv.width/2-120,6,240,32);
    ctx.strokeStyle='rgba(241,196,15,0.6)'; ctx.lineWidth=1.5;
    ctx.strokeRect(cv.width/2-120,6,240,32);
    ctx.fillStyle='#f1c40f'; ctx.font='bold 13px Arial';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(label,cv.width/2,22);
  }

  // ── Input ─────────────────────────────────────────────────────────────
  _bindCanvas(){
    const evs={
      mousedown:this._md.bind(this), mousemove:this._mm.bind(this),
      mouseup:this._mu.bind(this),   wheel:this._mw.bind(this),
      contextmenu:e=>e.preventDefault(),
      touchstart:this._ts.bind(this), touchmove:this._tm.bind(this), touchend:this._te.bind(this),
    };
    Object.entries(evs).forEach(([ev,fn])=>{
      this.cv.addEventListener(ev,fn,{passive:false});
      this._evs[ev]=fn;
    });
  }

  _cp(e){
    const r=this.cv.getBoundingClientRect();
    const cl=e.touches?e.touches[0]:e;
    return{sx:cl.clientX-r.left, sy:cl.clientY-r.top};
  }
  _sw(sx,sy){ return{x:(sx-this.vx)/this.vs, y:(sy-this.vy)/this.vs}; }
  _wg(wx,wy){ const {pps,ox,oy}=this.S.cfg; return{gx:Math.floor((wx-ox)/pps),gy:Math.floor((wy-oy)/pps)}; }
  _gw(gx,gy){ const {pps,ox,oy}=this.S.cfg; return{wx:ox+gx*pps,wy:oy+gy*pps}; }

  _tokenAt(wx,wy){
    const {gx,gy}=this._wg(wx,wy);
    return Object.entries(this.S.tokens).find(([,t])=>t.gx===gx&&t.gy===gy)?.[0]||null;
  }

  _md(e){
    e.preventDefault();
    const {sx,sy}=this._cp(e);
    const {x:wx,y:wy}=this._sw(sx,sy);
    const {gx,gy}=this._wg(wx,wy);
    this.L.mw={x:wx,y:wy}; this.L.ms={x:sx,y:sy};
    const m=this.L.mode, isDM=this.userRole==='dm';

    // Middle/right = pan
    if(e.button===1||e.button===2){
      this.L.pan={on:true,sx,sy,vx0:this.vx,vy0:this.vy}; return;
    }

    // Placing token on map
    if(isDM&&this.L.placing){
      this.placeToken(this.L.placing,gx,gy);
      this.L.placing=null;
      this._updateDashTokenList();
      return;
    }

    if(m==='ruler'){
      this.L.rulerA={x:wx,y:wy}; this.L.rulerB=null; this._dirty(); return;
    }
    if(m==='aoe'){
      this.L.rulerA={x:wx,y:wy}; this._dirty(); return;
    }
    if(isDM&&m==='obstacle'){
      this.L.painting=true; this._paintObs(gx,gy); return;
    }
    if(isDM&&m==='trigger'){
      this._placeTrigger(gx,gy); return;
    }
    if(isDM&&(m==='fogReveal'||m==='wizFog')){
      this.L.painting=true; this._revealCell(gx,gy); return;
    }
    if(isDM&&(m==='fogHide'||m==='wizFogHide')){
      this.L.painting=true; this._hideCell(gx,gy); return;
    }

    // Token drag
    const tn=this._tokenAt(wx,wy);
    if(tn){
      const ok=isDM||this._isMyTurn(tn);
      if(ok){
        const tk=this.S.tokens[tn];
        this.L.drag={cName:tn,startGX:tk.gx,startGY:tk.gy,curGX:tk.gx,curGY:tk.gy,path:[[tk.gx,tk.gy]]};
        this._dirty(); return;
      }
    }

    // Default pan
    if(m==='view'||m==='calibrate'||m==='phantom'){
      this.L.pan={on:true,sx,sy,vx0:this.vx,vy0:this.vy};
    }
  }

  _mm(e){
    const {sx,sy}=this._cp(e);
    const {x:wx,y:wy}=this._sw(sx,sy);
    const {gx,gy}=this._wg(wx,wy);
    this.L.mw={x:wx,y:wy}; this.L.ms={x:sx,y:sy};
    this._dirty();

    if(this.L.pan.on){
      this.vx=this.L.pan.vx0+(sx-this.L.pan.sx);
      this.vy=this.L.pan.vy0+(sy-this.L.pan.sy);
      this._dirty(); return;
    }
    if(this.L.mode==='ruler'&&this.L.rulerA){ this.L.rulerB={x:wx,y:wy}; this._dirty(); }

    const isDM=this.userRole==='dm';
    if(this.L.painting&&isDM){
      const m=this.L.mode;
      if(m==='obstacle')  this._paintObs(gx,gy);
      if(m==='fogReveal'||m==='wizFog')     this._revealCell(gx,gy);
      if(m==='fogHide'  ||m==='wizFogHide') this._hideCell(gx,gy);
    }

    if(this.L.drag){
      const dt=this.L.drag;
      if(dt.curGX!==gx||dt.curGY!==gy){
        dt.curGX=gx; dt.curGY=gy;
        dt.path=this._buildPath(dt.startGX,dt.startGY,gx,gy,dt.cName);
        this._dirty();
      }
    }
  }

  _mu(e){
    this.L.pan.on=false; this.L.painting=false;
    if(this.L.drag) this._endDrag();
  }

  _mw(e){
    e.preventDefault();
    const {sx,sy}=this._cp(e);
    const delta=e.deltaY<0?1.1:0.91;
    const ns=Math.min(4,Math.max(0.2,this.vs*delta));
    this.vx=sx-(sx-this.vx)*(ns/this.vs);
    this.vy=sy-(sy-this.vy)*(ns/this.vs);
    this.vs=ns; this._dirty();
  }

  _ts(e){ e.preventDefault(); this._md({...e,clientX:e.touches[0].clientX,clientY:e.touches[0].clientY,button:0}); }
  _tm(e){ e.preventDefault(); this._mm({...e,clientX:e.touches[0].clientX,clientY:e.touches[0].clientY}); }
  _te(e){ e.preventDefault(); this._mu(e); }

  // ── Movement & drag ────────────────────────────────────────────────────
  _isMyTurn(cn){
    return cn===this.cName && this.L.sc[this.L.ati]?.name===this.cName;
  }

  _buildPath(sx,sy,ex,ey,cName){
    // Chebyshev walk avoiding obstacles
    const cells=[[sx,sy]]; let cx=sx,cy=sy;
    while((cx!==ex||cy!==ey)&&cells.length<120){
      const dx=Math.sign(ex-cx), dy=Math.sign(ey-cy);
      const opts=[[cx+dx,cy+dy],[cx+dx,cy],[cx,cy+dy]];
      const next=opts.find(([nx,ny])=>!this.S.obstacles[ck(nx,ny)]&&(nx!==cx||ny!==cy));
      if(!next) break;
      [cx,cy]=next; cells.push([cx,cy]);
    }
    return cells;
  }

  _endDrag(){
    const dt=this.L.drag; this.L.drag=null;
    if(!dt||dt.curGX===dt.startGX&&dt.curGY===dt.startGY){ this._dirty(); return; }

    const isDM=this.userRole==='dm';
    const pl=this.S.players[dt.cName]||{};
    const speed=pl.speed||MAP_W_DEFAULT;
    const sq=(dt.path?.length||1)-1;
    const prevUsed=this.S.tokens[dt.cName]?.usedMv||0;
    const newUsed=prevUsed+sq*FT_PER_SQ;

    if(!isDM&&newUsed>speed){ this._dirty(); return; } // reject

    if(this.db){
      this.db.moveMapToken(this.activeRoom,dt.cName,dt.curGX,dt.curGY,isDM?prevUsed:newUsed);
      // Vision reveal
      this._revealForToken(dt.cName,dt.curGX,dt.curGY);
      // Trigger check
      this._checkTrigger(dt.curGX,dt.curGY,dt.cName);
    }
    this._dirty();
  }

  _visionR(cn){
    const pl=this.S.players[cn]||{};
    if(pl.darkvision) return Math.ceil(60/FT_PER_SQ);
    return Math.ceil(30/FT_PER_SQ);
  }

  _revealForToken(cn,gx,gy,r){
    if(!this.db) return;
    const vr=r||this._visionR(cn);
    const cells={};
    for(let dx=-vr;dx<=vr;dx++) for(let dy=-vr;dy<=vr;dy++){
      if(cheb(0,0,dx,dy)<=vr) cells[ck(gx+dx,gy+dy)]=true;
    }
    this.db.revealFogCells(this.activeRoom,this.S.activeScene,cells);
  }

  _checkTrigger(gx,gy,cn){
    const key=ck(gx,gy);
    const t=this.S.triggers[key];
    if(!t||t.fired||this.L.firedLocal.has(key)) return;
    this.L.firedLocal.add(key);
    if(this.db){
      this.db.fireTrigger(this.activeRoom,this.S.activeScene,key);
      this.db.saveRollToDB({
        cName:'DM',type:'STATUS',
        status:`⚠️ TRIGGER "${t.label||'Trap'}" — ${cn} at [${gx},${gy}]!`,
        ts:Date.now()
      });
    }
    // Sound: descending siren
    if(!this.isMuted){
      try{
        const ac=new(window.AudioContext||window.webkitAudioContext)();
        [440,330,220].forEach((f,i)=>{
          const o=ac.createOscillator(),g=ac.createGain();
          o.connect(g); g.connect(ac.destination);
          o.type='sawtooth'; o.frequency.value=f;
          const t0=ac.currentTime+i*0.15;
          g.gain.setValueAtTime(0.25,t0);
          g.gain.exponentialRampToValueAtTime(0.001,t0+0.35);
          o.start(t0); o.stop(t0+0.35);
        });
      }catch(_){}
    }
  }

  // ── DM tools ───────────────────────────────────────────────────────────
  _paintObs(gx,gy){
    const key=ck(gx,gy);
    if(this.localOnly){
      if(this.L.tool==='erase') delete this.S.obstacles[key];
      else this.S.obstacles[key]=true;
      this._dirty(); return;
    }
    if(!this.db) return;
    this.db.setObstacle(this.activeRoom,this.S.activeScene,key,this.L.tool==='paint'?true:null);
  }

  _placeTrigger(gx,gy){
    const key=ck(gx,gy);
    if(this.localOnly){
      if(this.S.triggers[key]){ delete this.S.triggers[key]; this._dirty(); return; }
      this.L.pendingTrigger={gx,gy,key};
      this._showTriggerForm(gx,gy); return;
    }
    if(!this.db) return;
    const existing=this.S.triggers[key];
    if(existing){ this.db.setTrigger(this.activeRoom,this.S.activeScene,key,null); return; }
    // Store pending placement, show inline confirm UI
    this.L.pendingTrigger={gx,gy,key};
    this._showTriggerForm(gx,gy);
  }

  _showTriggerForm(gx,gy){
    // Build or reuse a small inline form near the dashboard
    let form=document.getElementById('map-trigger-form');
    if(!form){
      form=document.createElement('div');
      form.id='map-trigger-form';
      form.style.cssText='position:absolute;background:rgba(13,10,30,0.97);border:1.5px solid rgba(241,196,15,0.5);border-radius:10px;padding:10px 12px;z-index:200;box-shadow:0 6px 24px rgba(0,0,0,0.7);min-width:190px;';
      document.getElementById('map-canvas-container')?.appendChild(form);
    }
    // Position near canvas centre
    const cc=document.getElementById('map-canvas-container');
    form.style.left=(cc?cc.clientWidth/2-95:120)+'px';
    form.style.top='60px';
    form.innerHTML=`
      <div style="font-size:11px;color:#f1c40f;font-weight:bold;margin-bottom:6px;">⚠️ New Trigger at [${gx},${gy}]</div>
      <input id="map-trigger-label" type="text" value="Trap"
        style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);color:white;border-radius:5px;padding:5px 7px;font-size:12px;outline:none;margin-bottom:7px;">
      <div style="display:flex;gap:5px;">
        <button id="map-trigger-confirm" style="flex:1;background:rgba(241,196,15,0.2);border:1px solid rgba(241,196,15,0.5);color:#f1c40f;border-radius:5px;padding:5px;font-size:11px;font-weight:bold;cursor:pointer;">✓ Place</button>
        <button id="map-trigger-cancel"  style="flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:#aaa;border-radius:5px;padding:5px;font-size:11px;cursor:pointer;">✕ Cancel</button>
      </div>
    `;
    form.style.display='block';
    const input=document.getElementById('map-trigger-label');
    input?.focus(); input?.select();
    document.getElementById('map-trigger-confirm').onclick=()=>{
      const label=(input?.value.trim())||'Trap';
      const pt=this.L.pendingTrigger;
      if(pt){
        if(this.localOnly){ this.S.triggers[pt.key]={label,fired:false}; this._dirty(); }
        else if(this.db)   { this.db.setTrigger(this.activeRoom,this.S.activeScene,pt.key,{label,fired:false}); }
      }
      this.L.pendingTrigger=null;
      form.style.display='none';
    };
    document.getElementById('map-trigger-cancel').onclick=()=>{
      this.L.pendingTrigger=null;
      form.style.display='none';
    };
    // Also close on Enter
    input?.addEventListener('keydown',e=>{
      if(e.key==='Enter') document.getElementById('map-trigger-confirm')?.click();
      if(e.key==='Escape') document.getElementById('map-trigger-cancel')?.click();
    });
  }

  _revealCell(gx,gy,r=1){
    const cells={};
    for(let dx=-r;dx<=r;dx++) for(let dy=-r;dy<=r;dy++){
      if(cheb(0,0,dx,dy)<=r) cells[ck(gx+dx,gy+dy)]=true;
    }
    if(this.localOnly){ Object.assign(this.S.fog,cells); this._dirty(); return; }
    if(!this.db) return;
    this.db.revealFogCells(this.activeRoom,this.S.activeScene,cells);
  }

  _hideCell(gx,gy){
    if(this.localOnly){ delete this.S.fog[ck(gx,gy)]; this._dirty(); return; }
    if(!this.db) return;
    this.db.hideFogCell(this.activeRoom,this.S.activeScene,ck(gx,gy));
  }

  revealAll(){
    if(!this.db) return;
    const {mapW:mw,mapH:mh}=this.S.cfg;
    const cells={};
    for(let gx=0;gx<(mw||MAP_W_DEFAULT);gx++) for(let gy=0;gy<(mh||MAP_H_DEFAULT);gy++) cells[ck(gx,gy)]=true;
    this.db.revealFogCells(this.activeRoom,this.S.activeScene,cells);
  }

  hideAll(){
    if(!this.db) return;
    this.db.resetFog(this.activeRoom,this.S.activeScene);
  }

  getBgTileCount(){
    if(this.L.mode!=='phantom') return null;
    const fit=this._getBgFit();
    const {pps}=this.S.cfg;
    return {
      cols:Math.max(1,Math.floor(fit.w/pps)),
      rows:Math.max(1,Math.floor(fit.h/pps)),
    };
  }

  // ── Background / Config ────────────────────────────────────────────────
  _loadBg(url){
    this.L.bg=null; this.L.bgLoading=true;
    const img=new Image(); img.crossOrigin='anonymous';
    img.onload=()=>{ this.L.bg=img; this.L.bgLoading=false; this._dirty(); };
    img.onerror=()=>{ this.L.bgLoading=false; };
    img.src=url;
  }

  loadBgUrl(url){
    this._loadBg(url);
    if(this.db) this.db.setMapCfg(this.activeRoom,{...this.S.cfg,bgUrl:url});
  }

  loadBgFile(file){
    const r=new FileReader();
    r.onload=e=>{
      const img=new Image(); img.onload=()=>{ this.L.bg=img; this._dirty(); };
      img.src=e.target.result;
      // Store URL hint in Firebase for others (data URI not stored—too large)
      // Only local preview; share via external URL instead
    };
    r.readAsDataURL(file);
  }

  nudgeGrid(dpps,dox,doy){
    if(this.S.cfg.locked) return;
    const pps=Math.min(MAX_PPS,Math.max(MIN_PPS,this.S.cfg.pps+(dpps||0)));
    this.S.cfg={...this.S.cfg,pps,ox:this.S.cfg.ox+(dox||0),oy:this.S.cfg.oy+(doy||0)};
    this._dirty();
  }

  lockGrid(){
    if(!this.db) return;
    const cfg={...this.S.cfg,locked:true};
    this.db.setMapCfg(this.activeRoom,cfg);
  }

  unlockGrid(){
    if(!this.db) return;
    const cfg={...this.S.cfg,locked:false};
    this.db.setMapCfg(this.activeRoom,cfg);
  }

  saveGridToFirebase(){
    if(!this.db) return;
    this.db.setMapCfg(this.activeRoom,this.S.cfg);
  }

  // ── Token placement ────────────────────────────────────────────────────
  placeToken(cn,gx,gy){
    if(!this.db) return;
    this.db.moveMapToken(this.activeRoom,cn,gx,gy,0);
    this._revealForToken(cn,gx,gy);
    this._dirty();
  }

  removeToken(cn){
    if(!this.db) return;
    this.db.removeMapToken(this.activeRoom,cn);
    this._dirty();
  }

  resetAllMovement(){
    if(!this.db) return;
    Object.keys(this.S.tokens).forEach(cn=>this.db.resetTokenMv(this.activeRoom,cn));
  }

  // ── Scene management ────────────────────────────────────────────────────
  createScene(name,bgUrl=''){
    if(!this.db) return;
    const sid='scene_'+Date.now();
    const cfg={...this.S.cfg,bgUrl};
    this.db.saveScene(this.activeRoom,sid,{name,config:cfg});
    this.db.setActiveScene(this.activeRoom,sid);
    return sid;
  }

  loadScene(sid){
    if(!this.db) return;
    this.db.setActiveScene(this.activeRoom,sid);
  }

  // ── Mode & tool setters ────────────────────────────────────────────────
  setAtmosphere(a){
    this.S.atmosphere = { ...this.S.atmosphere, ...(a||{}) };
    this._dirty();
  }
  setMode(m){ this.L.mode=m; this._dirty(); }
  setTool(t){ this.L.tool=t; }
  setAoeShape(s){ this.L.aoeShape=s; this._dirty(); }
  setAoeRadius(r){ this.L.aoeR=r; this._dirty(); }
  startPlacing(cn){ this.L.placing=cn; this.L.mode='view'; this._dirty(); }
  cancelPlacing(){ this.L.placing=null; this._dirty(); }

  resize(w,h){ this.cv.width=w; this.cv.height=h; this.fw.width=w; this.fw.height=h; this._dirty(); }

  _updateDashTokenList(){
    const list=document.getElementById('map-token-roster');
    if(!list) return;

    const players=this.S.players, tokens=this.S.tokens;
    const desired=Object.keys(players).filter(cn=>players[cn]?.userRole!=='dm');

    // Remove rows for players no longer in the room
    list.querySelectorAll('[data-cn]').forEach(row=>{
      if(!players[row.dataset.cn]) row.remove();
    });

    desired.forEach(cn=>{
      const p=players[cn];
      const onMap=!!tokens[cn];
      let row=list.querySelector(`[data-cn="${CSS.escape(cn)}"]`);

      if(!row){
        // Create new row
        row=document.createElement('div');
        row.className='map-token-row';
        row.dataset.cn=cn;
        list.appendChild(row);
      }

      // Only rewrite innerHTML if the "onMap" state or name changed
      const prevOnMap=row.dataset.onmap==='1';
      if(prevOnMap===onMap && row.dataset.rendered==='1') return;
      row.dataset.onmap=onMap?'1':'0';
      row.dataset.rendered='1';

      row.innerHTML=`
        <img src="${p?.portrait||'assets/logo.png'}" style="width:24px;height:24px;border-radius:50%;border:2px solid ${p?.pColor||'#fff'}">
        <span style="flex:1;font-size:12px;color:white;">${cn}</span>
        ${onMap
          ?`<button onclick="window._mapEng.removeToken('${cn}')" class="map-dash-btn" style="width:auto;padding:3px 7px;background:rgba(231,76,60,0.4);border-color:#e74c3c;">✕</button>`
          :`<button onclick="window._mapEng.startPlacing('${cn}')" class="map-dash-btn" style="width:auto;padding:3px 7px;">📍</button>`
        }
      `;
    });
  }
}
