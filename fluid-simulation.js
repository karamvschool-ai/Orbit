/* compact radial material transport. the black source disc is sampled through an
 * inverse displacement map; no white pixels, historical cuts or cursor overlay. */
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = value => value * value * (3 - 2 * value);

export function createFluidSimulation({ resolution = 128, bounds = 176, radius = 112 } = {}) {
  const n = clamp(Math.round(Number(resolution) || 128), 32, 256);
  bounds = Math.max(16, Number(bounds) || 176);
  radius = clamp(Number(radius) || 112, 4, bounds * 0.88);
  const cell = bounds * 2 / (n - 1);
  const density = new Float32Array(n * n);
  const state = { x: 0, y: 0, opening: 0, stretch: 1, dx: 1, dy: 0, time: 0, influence: 48, radius };
  let previousX = 0;
  let previousY = 0;
  let previousStrength = 0;
  let disposed = false;
  let dirty = false;

  function sourcePoint(x, y) {
    if (state.opening < 0.001) return [x, y, 1000];

    const dx = x - state.x;
    const dy = y - state.y;
    const a = (dx * state.dx + dy * state.dy) / state.stretch;
    const b = (-dx * state.dy + dy * state.dx) * state.stretch;
    const distance = Math.hypot(a, b);
    const angle = Math.atan2(b, a);
    const opening = state.opening * (1 + 0.014 * Math.sin(angle * 2 + state.time * 0.9) +
      0.006 * Math.sin(angle * 3 - state.time * 0.7));
    const opening_squared = opening * opening;
    const range_squared = state.influence * state.influence;
    const distance_squared = distance * distance;

    // work backward from the cursor to find where the black surface came from.
    let source_squared = Math.max(0, distance_squared - opening_squared);
    for (let i = 0; i < 4; i++) {
      const falloff = Math.exp(-source_squared / range_squared);
      const error = source_squared + opening_squared * falloff - distance_squared;
      const slope = 1 - opening_squared / range_squared * falloff;
      source_squared = Math.max(0, source_squared - error / slope);
    }

    const scale = Math.sqrt(source_squared) / Math.max(distance, 0.0001);
    const sa = a * scale * state.stretch;
    const sb = b * scale / state.stretch;
    return [
      state.x + sa * state.dx - sb * state.dy,
      state.y + sa * state.dy + sb * state.dx,
      distance - opening,
    ];
  }

  function signedDistance(x,y) {
    const [sx,sy,horizon]=sourcePoint(x,y);
    return Math.max(Math.hypot(sx,sy)-radius,-horizon);
  }

  function updateDensity() {
    const edge=cell*.46;
    for(let y=0;y<n;y++) for(let x=0;x<n;x++) {
      const sdf=signedDistance(x*cell-bounds,y*cell-bounds);
      const coverage=clamp(.5-sdf/(edge*2),0,1);
      density[y*n+x]=smooth(coverage);
    }
  }

  function step(pointer,strength=0,delta=1/60,motionTime) {
    if(disposed) return;
    const x=Number.isFinite(pointer?.x)?pointer.x:0,y=Number.isFinite(pointer?.y)?pointer.y:0;
    strength=clamp(Number(strength)||0,0,1);
    if(Math.hypot(x,y)>bounds+40) strength=0;
    const dt=clamp(Number(delta)||0,0,.06);
    state.time=Number.isFinite(motionTime)?motionTime:state.time+dt;
    // position is exact. only opening size and small motion squash have inertia.
    if(strength>.001) {state.x=x;state.y=y;}
    const target=28*strength;
    const blend=1-Math.exp(-dt*(target>state.opening?72:27));
    state.opening+=(target-state.opening)*blend;
    if(strength<.001 && state.opening<.025) state.opening=0;
    const vx=previousStrength>.001?(x-previousX)/Math.max(dt,.001):0;
    const vy=previousStrength>.001?(y-previousY)/Math.max(dt,.001):0;
    const speed=Math.hypot(vx,vy);
    if(speed>8&&strength>.001) {state.dx=vx/speed;state.dy=vy/speed;}
    const stretch=1+Math.min(speed/3200,.065)*strength;
    state.stretch+=(stretch-state.stretch)*(1-Math.exp(-dt*22));
    previousX=x;previousY=y;previousStrength=strength;
    dirty=true;
  }

  // the forward mapping also moves the exterior horizon for the fallback corona.
  function displacePoint(x,y) {
    const dx=x-state.x,dy=y-state.y;
    const a=(dx*state.dx+dy*state.dy)/state.stretch;
    const b=(-dx*state.dy+dy*state.dx)*state.stretch;
    const r=Math.hypot(a,b),angle=Math.atan2(b,a);
    const h=state.opening*(1+.014*Math.sin(angle*2+state.time*.9)+.006*Math.sin(angle*3-state.time*.7));
    const next=Math.sqrt(r*r+h*h*Math.exp(-r*r/(state.influence*state.influence)));
    const scale=next/Math.max(r,.0001);
    return [state.x+a*scale*state.stretch*state.dx-b*scale/state.stretch*state.dy,
      state.y+a*scale*state.stretch*state.dy+b*scale/state.stretch*state.dx];
  }

  updateDensity();
  return { step,get density(){if(dirty){updateDensity();dirty=false;}return density;},resolution:n,getState:()=>state,signedDistance,displacePoint,destroy(){disposed=true;} };
}
