import { createFluidSimulation } from './fluid-simulation.js';

const BOUNDS=176,SIZE=BOUNDS*4;
const TAU=Math.PI*2;

export function createCoreField({radius=112}={}) {
  const fluid=createFluidSimulation({resolution:160,bounds:BOUNDS,radius});
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=SIZE;
  const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false,antialias:false,depth:false,preserveDrawingBuffer:true});
  const resources={shaders:[],program:null,buffer:null};
  function releaseGL() {
    if(!gl)return;
    if(resources.buffer)gl.deleteBuffer(resources.buffer);
    resources.shaders.forEach(shader=>gl.deleteShader(shader));
    if(resources.program)gl.deleteProgram(resources.program);
  }
  if(gl) {
    const vertex=`attribute vec2 a_position;varying vec2 v_uv;
      void main(){v_uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}`;
    const fragment=`precision mediump float;
      varying vec2 v_uv;
      uniform vec2 u_pointer,u_direction;
      uniform float u_radius,u_bounds,u_opening,u_stretch,u_time,u_energy,u_listening,u_thinking,u_complete;
      vec3 transported(vec2 world) {
        if(u_opening<.001)return vec3(world,1000.);
        vec2 d=world-u_pointer;
        float a=dot(d,u_direction)/u_stretch;
        float b=dot(d,vec2(-u_direction.y,u_direction.x))*u_stretch;
        float r=length(vec2(a,b)/48.)*48.;
        float angle=atan(b,a);
        float h=u_opening*(1.+.014*sin(angle*2.+u_time*.9)+.006*sin(angle*3.-u_time*.7));
        float rr=r/48.,hh=h/48.;
        float z=max(0.,rr*rr-hh*hh);
        for(int k=0;k<4;k++){
          float e=exp(-z);
          z=max(0.,z-(z+hh*hh*e-rr*rr)/(1.-hh*hh*e));
        }
        float factor=sqrt(z)*48./max(r,.0001);
        vec2 source=u_pointer+a*factor*u_stretch*u_direction+
          b*factor/u_stretch*vec2(-u_direction.y,u_direction.x);
        return vec3(source,r-h);
      }
      void main(){
        vec2 world=(vec2(v_uv.x,1.-v_uv.y)-.5)*u_bounds*2.;
        vec3 material=transported(world);
        float outerSdf=length(material.xy)-u_radius;
        float sdf=max(outerSdf,-material.z);
        float black=1.-smoothstep(-.46,.46,sdf);
        float r=length(world),angle=atan(world.y,world.x);
        // A stable bright side belongs to the light flow, never to the black body.
        float bright=pow(.5+.5*cos(angle+2.35),1.65);
        float listenWave=.5+.5*sin(u_time*3.2);
        float intensity=1.+u_listening*(.035+.12*listenWave)+u_thinking*.055+clamp(u_energy,0.,1.)*.055;
        float lightRipple=sin(angle*17.-u_time*.36)*.15+sin(angle*29.+u_time*.22)*.06;
        float primaryDistance=outerSdf-1.55-lightRipple;
        float primary=exp(-pow(primaryDistance/.58,2.))*(.10+.83*bright)*intensity;
        float soft=exp(-pow(primaryDistance/1.45,2.))*(.012+.075*bright)*intensity;
        float secondary=exp(-pow((outerSdf-5.6-lightRipple*.55)/.33,2.))*(.025+.12*bright);
        float tertiary=exp(-pow((outerSdf-9.3-lightRipple*.35)/.27,2.))*.040*bright;
        // Differential angular speeds shear short streaks through the fixed hot side.
        float speed=.54;
        float streakA=pow(.5+.5*cos(angle-u_time*speed-1.3),420.);
        float streakB=pow(.5+.5*cos(angle-u_time*(speed*.76)+1.9),610.);
        float streakC=pow(.5+.5*cos(angle-u_time*(speed*1.18)-3.6),510.);
        float streak=exp(-pow((primaryDistance+.20)/.25,2.))*(streakA+streakC*.54)*bright*.44+
          exp(-pow((outerSdf-3.15-lightRipple*.65)/.30,2.))*streakB*bright*.31;
        // A narrow, localized contrast shoulder makes white light legible on ivory.
        float shoulder=exp(-pow((outerSdf-3.8-lightRipple*.65)/1.45,2.))*(.018+.19*bright);
        float exterior=smoothstep(u_radius-1.,u_radius+.6,r);
        float white=clamp(primary+soft*(1.-primary)+secondary+tertiary+streak,0.,1.)*exterior;
        float shade=shoulder*exterior;
        if(u_complete>=0.) {
          float progress=clamp(u_complete,0.,1.);
          float envelope=sin(progress*3.14159265)*pow(1.-progress,.7)*.42;
          float ripple=exp(-pow((r-u_radius-5.-progress*48.)/1.1,2.))*envelope;
          shade=clamp(shade+ripple*.32,0.,1.);
          white=clamp(white+exp(-pow((r-u_radius-3.-progress*48.)/1.3,2.))*envelope,0.,1.);
        }
        float coronaAlpha=white+shade*(1.-white);
        float coronaRgb=white+shade*.27*(1.-white);
        float alpha=black+coronaAlpha*(1.-black);
        float rgb=coronaRgb*(1.-black)/max(alpha,.0001);
        gl_FragColor=vec4(vec3(rgb),alpha);
      }`;
    try {
      const compile=(type,source)=>{
        const shader=gl.createShader(type);if(!shader)throw new Error('Shader unavailable');
        resources.shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
        if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error('Shader unavailable');
        return shader;
      };
      resources.program=gl.createProgram();if(!resources.program)throw new Error('Shader unavailable');
      gl.attachShader(resources.program,compile(gl.VERTEX_SHADER,vertex));
      gl.attachShader(resources.program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(resources.program);
      if(!gl.getProgramParameter(resources.program,gl.LINK_STATUS))throw new Error('Shader unavailable');
      gl.useProgram(resources.program);
      resources.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,resources.buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const position=gl.getAttribLocation(resources.program,'a_position');
      gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
      const uniform=name=>gl.getUniformLocation(resources.program,name);
      const uniforms=Object.fromEntries(['pointer','direction','radius','bounds','opening','stretch','time','energy','listening','thinking','complete'].map(name=>[name,uniform(`u_${name}`)]));
      gl.uniform1f(uniforms.radius,radius);gl.uniform1f(uniforms.bounds,BOUNDS);gl.viewport(0,0,SIZE,SIZE);
      let disposed=false;
      return {
        bounds:BOUNDS,
        displacePoint:(x,y)=>fluid.displacePoint(x,y),
        render(pointer,strength,energy=0,delta=1/60,time,visual={}){
          if(disposed)return canvas;
          fluid.step(pointer,strength,delta,time);const state=fluid.getState();
          gl.uniform2f(uniforms.pointer,state.x,state.y);gl.uniform2f(uniforms.direction,state.dx,state.dy);
          gl.uniform1f(uniforms.opening,state.opening);gl.uniform1f(uniforms.stretch,state.stretch);
          gl.uniform1f(uniforms.time,state.time);gl.uniform1f(uniforms.energy,energy);
          gl.uniform1f(uniforms.listening,visual.listening||0);gl.uniform1f(uniforms.thinking,visual.thinking||0);
          gl.uniform1f(uniforms.complete,Number.isFinite(visual.completeProgress)?visual.completeProgress:-1);
          gl.drawArrays(gl.TRIANGLES,0,6);return canvas;
        },
        destroy(){if(disposed)return;disposed=true;fluid.destroy();releaseGL();},
      };
    } catch {releaseGL();}
  }

  // Canvas fallback renders the same transported density, with an exterior-only
  // corona underneath it. Shader compilation failure therefore keeps the effect.
  const fallback=document.createElement('canvas');fallback.width=fallback.height=SIZE;
  const ctx=fallback.getContext('2d');
  const grid=document.createElement('canvas');grid.width=grid.height=fluid.resolution;
  const gridCtx=grid.getContext('2d');const image=gridCtx.createImageData(fluid.resolution,fluid.resolution);
  let disposed=false;
  function contour(offset,time,start=0,end=TAU){
    ctx.beginPath();
    for(let i=0;i<=192;i++){
      const a=start+i/192*(end-start);
      const irregular=Math.sin(a*17-time*.36)*.15+Math.sin(a*29+time*.22)*.06;
      const r=radius+offset+irregular;
      const p=fluid.displacePoint(Math.cos(a)*r,Math.sin(a)*r);
      if(!i)ctx.moveTo(...p);else ctx.lineTo(...p);
    }
    if(end-start>=TAU-.001)ctx.closePath();
  }
  return {
    bounds:BOUNDS,
    displacePoint:(x,y)=>fluid.displacePoint(x,y),
    render(pointer,strength,energy=0,delta=1/60,time,visual={}){
      if(disposed)return fallback;
      fluid.step(pointer,strength,delta,time);const state=fluid.getState();
      const values=fluid.density;
      for(let i=0;i<values.length;i++)image.data[i*4+3]=Math.round(values[i]*255);
      gridCtx.putImageData(image,0,0);
      ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,SIZE,SIZE);
      ctx.setTransform(2,0,0,2,BOUNDS*2,BOUNDS*2);
      ctx.save();ctx.beginPath();ctx.rect(-BOUNDS,-BOUNDS,BOUNDS*2,BOUNDS*2);
      ctx.arc(0,0,radius-.8,0,TAU,true);ctx.clip('evenodd');
      const listening=Math.max(0,Math.min(1,visual.listening||0));
      const thinking=Math.max(0,Math.min(1,visual.thinking||0));
      const listenWave=.5+.5*Math.sin(state.time*3.2);
      const intensity=1+listening*(.035+.12*listenWave)+thinking*.055+Math.max(0,Math.min(1,energy))*.055;
      const lightGradient=(low,high,color='255,255,255')=>{
        const direction=-2.35,reach=radius+12;
        const dx=Math.cos(direction)*reach,dy=Math.sin(direction)*reach;
        const gradient=ctx.createLinearGradient(-dx,-dy,dx,dy);
        for(const t of [0,.15,.35,.55,.75,1]) {
          const brightness=t**1.65;
          gradient.addColorStop(t,`rgba(${color},${Math.min(1,low+(high-low)*brightness)})`);
        }
        return gradient;
      };
      // Narrow light and localized graphite contrast replace the broad bevel.
      contour(3.8,state.time);ctx.strokeStyle=lightGradient(.018,.208,'66,72,75');ctx.lineWidth=2.10;
      ctx.shadowColor='rgba(65,72,75,.05)';ctx.shadowBlur=1.4;ctx.stroke();
      contour(1.55,state.time);ctx.strokeStyle=lightGradient(.012,.087*intensity);ctx.lineWidth=2.55;
      ctx.shadowColor='rgba(255,255,255,.09)';ctx.shadowBlur=1.8;ctx.stroke();
      contour(1.55,state.time);ctx.strokeStyle=lightGradient(.10,.93*intensity);ctx.lineWidth=1.03;
      ctx.shadowBlur=0;ctx.stroke();
      contour(5.6,state.time);ctx.strokeStyle=lightGradient(.025,.145);ctx.lineWidth=.55;ctx.stroke();
      contour(9.3,state.time);ctx.strokeStyle=lightGradient(0,.040);ctx.lineWidth=.45;ctx.stroke();
      const speed=.54;
      for(const [center,offset,width,alpha]of[
        [state.time*speed+1.3,1.35,.058,.44],
        [state.time*speed*.76-1.9,3.15,.048,.31],
        [state.time*speed*1.18+3.6,1.35,.053,.24],
      ]) {
        const bright=(.5+.5*Math.cos(center+2.35))**1.65;
        // Fade both tips so each streak reads as a current rather than a specular dot.
        const from=center-width,to=center+width;
        const a=fluid.displacePoint(Math.cos(from)*(radius+offset),Math.sin(from)*(radius+offset));
        const b=fluid.displacePoint(Math.cos(to)*(radius+offset),Math.sin(to)*(radius+offset));
        const streak=ctx.createLinearGradient(a[0],a[1],b[0],b[1]);
        streak.addColorStop(0,'rgba(255,255,255,0)');
        streak.addColorStop(.5,`rgba(255,255,255,${alpha*bright})`);
        streak.addColorStop(1,'rgba(255,255,255,0)');
        contour(offset,state.time,from,to);ctx.strokeStyle=streak;ctx.lineWidth=.55;ctx.stroke();
      }
      if(Number.isFinite(visual.completeProgress)&&visual.completeProgress>=0) {
        const progress=Math.max(0,Math.min(1,visual.completeProgress));
        const alpha=Math.sin(progress*Math.PI)*(1-progress)**.7*.42;
        ctx.shadowBlur=0;ctx.beginPath();ctx.arc(0,0,radius+5+progress*48,0,TAU);
        ctx.strokeStyle=`rgba(60,67,70,${alpha*.32})`;ctx.lineWidth=1.1;ctx.stroke();
        ctx.beginPath();ctx.arc(0,0,radius+3+progress*48,0,TAU);
        ctx.strokeStyle=`rgba(255,255,255,${alpha})`;ctx.lineWidth=1.25;ctx.stroke();
      }
      ctx.restore();
      ctx.imageSmoothingEnabled=true;ctx.drawImage(grid,-BOUNDS,-BOUNDS,BOUNDS*2,BOUNDS*2);
      return fallback;
    },
    destroy(){disposed=true;fluid.destroy();},
  };
}
