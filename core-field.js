// A local repulsion field remaps the black material itself. Nothing is painted
// at the cursor: uncovered areas are transparent to the scene underneath.
const TAU = Math.PI * 2;
const REACH = 76;
const BOUNDS = 154;
const SIZE = BOUNDS * 4;

function pressure(angle, pointer, strength) {
  return 17 * strength * (1 + .12 * Math.sin(angle * 3 + pointer.x * .035) + .07 * Math.sin(angle * 5 + pointer.y * .026));
}

export function createCoreField({ radius = 104 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false, depth: false, preserveDrawingBuffer: true });
  const shaders = [];
  let program, buffer;
  if (gl) {
    const vertexSource = `attribute vec2 a_position; varying vec2 v_uv;
      void main() { v_uv = a_position * .5 + .5; gl_Position = vec4(a_position,0.,1.); }`;
    const fragmentSource = `
      precision highp float;
      varying vec2 v_uv;
      uniform vec2 u_pointer;
      uniform float u_strength, u_radius, u_bounds, u_energy;
      void main() {
        vec2 world = vec2(v_uv.x - .5, .5 - v_uv.y) * u_bounds * 2.;
        vec2 delta = world - u_pointer;
        float distance = length(delta);
        float angle = atan(delta.y,delta.x);
        float reach = 76.;
        float pressure = 17. * u_strength * (1. + .12 * sin(angle * 3. + u_pointer.x * .035) + .07 * sin(angle * 5. + u_pointer.y * .026));
        vec2 source = world;
        float coverage = 1.;
        if (u_strength > .0001 && distance < reach) {
          // Invert the physical outward displacement F(r)=r+P(1-r/L)^3.
          // P<L/3 makes F monotonic, so material does not fold over itself.
          float r = max(distance - pressure,0.);
          for (int i=0; i<6; i++) {
            float falloff = max(1. - r/reach,0.);
            float error = r + pressure * falloff * falloff * falloff - distance;
            float derivative = 1. - 3. * pressure / reach * falloff * falloff;
            r = clamp(r - error / max(derivative,.15),0.,distance);
          }
          source = u_pointer + delta / max(distance,.0001) * r;
          coverage = smoothstep(pressure - .55,pressure + .55,distance);
        }
        float sdf = length(source) - (u_radius + u_energy * .5);
        float black = 1. - smoothstep(-.45,.45,sdf);
        float exterior = 1. - black;
        float halo = exp(-sdf*sdf/95.) * .93 * exterior;
        float haze = exp(-pow((sdf-13.)/13.,2.)) * .10 * exterior;
        float alpha = black + (halo + haze * (1.-halo)) * exterior;
        vec3 light = vec3(halo + haze * .24 * (1.-halo)) * exterior;
        vec3 color = light / max(alpha,.0001);
        gl_FragColor = vec4(color,alpha*coverage);
      }`;
    try {
      function compile(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader,source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) { gl.deleteShader(shader); throw new Error('Shader unavailable'); }
        shaders.push(shader); return shader;
      }
      program = gl.createProgram();
      gl.attachShader(program,compile(gl.VERTEX_SHADER,vertexSource));
      gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragmentSource));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error('Shader unavailable');
      gl.useProgram(program);
      buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program,'a_position');
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
      gl.viewport(0,0,SIZE,SIZE);
      const uniform = name => gl.getUniformLocation(program,name);
      const pointerLocation=uniform('u_pointer'), strengthLocation=uniform('u_strength'), energyLocation=uniform('u_energy');
      gl.uniform1f(uniform('u_radius'),radius); gl.uniform1f(uniform('u_bounds'),BOUNDS);
      return {
        bounds: BOUNDS,
        render(pointer,strength,energy=0) {
          gl.uniform2f(pointerLocation,pointer.x,pointer.y);
          gl.uniform1f(strengthLocation,strength);
          gl.uniform1f(energyLocation,energy);
          gl.drawArrays(gl.TRIANGLES,0,6);
          return canvas;
        },
        destroy() { gl.deleteBuffer(buffer); shaders.forEach(shader=>gl.deleteShader(shader)); gl.deleteProgram(program); },
      };
    } catch {
      if (buffer) gl.deleteBuffer(buffer);
      shaders.forEach(shader=>gl.deleteShader(shader));
      if (program) gl.deleteProgram(program);
    }
  }
  // Same displacement geometry for devices without a usable WebGL context.
  const fallback = document.createElement('canvas');
  fallback.width=fallback.height=SIZE;
  const ctx=fallback.getContext('2d');
  return {
    bounds: BOUNDS,
    render(pointer,strength,energy=0) {
      ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,SIZE,SIZE);
      ctx.setTransform(2,0,0,2,BOUNDS*2,BOUNDS*2);
      ctx.beginPath();
      for (let i=0;i<=192;i++) {
        const a=i/192*TAU;
        let x=Math.cos(a)*(radius+energy*.5), y=Math.sin(a)*(radius+energy*.5);
        const dx=x-pointer.x,dy=y-pointer.y,d=Math.hypot(dx,dy);
        if (d<REACH && d>.001) {
          const push=pressure(Math.atan2(dy,dx),pointer,strength)*(1-d/REACH)**3;
          x+=dx/d*push; y+=dy/d*push;
        }
        if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.closePath(); ctx.shadowColor='#ffffff'; ctx.shadowBlur=14;
      ctx.strokeStyle='#ffffff';ctx.lineWidth=4;ctx.stroke();ctx.shadowBlur=0;
      ctx.fillStyle='#000000';ctx.fill();
      if(strength>.0001) {
        ctx.globalCompositeOperation='destination-out';ctx.beginPath();
        for(let i=0;i<=96;i++) {
          const a=i/96*TAU,r=pressure(a,pointer,strength);
          const x=pointer.x+Math.cos(a)*r,y=pointer.y+Math.sin(a)*r;
          if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
        }
        ctx.closePath();ctx.fill();ctx.globalCompositeOperation='source-over';
      }
      return fallback;
    },
    destroy() {},
  };
}
