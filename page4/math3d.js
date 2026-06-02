export class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone()         { return new Vec3(this.x, this.y, this.z); }
  set(x, y, z)   { this.x = x; this.y = y; this.z = z; return this; }
  copy(v)         { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  add(v)          { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  addScaled(v, s) { this.x += v.x*s; this.y += v.y*s; this.z += v.z*s; return this; }
  sub(v)          { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  scale(s)        { this.x *= s; this.y *= s; this.z *= s; return this; }
  dot(v)          { return this.x*v.x + this.y*v.y + this.z*v.z; }
  lengthSq()      { return this.dot(this); }
  length()        { return Math.sqrt(this.lengthSq()); }
  normalize()     { const l = this.length(); if (l > 1e-8) this.scale(1/l); return this; }
  cross(v)        {
    const {x,y,z} = this;
    this.x = y*v.z - z*v.y; this.y = z*v.x - x*v.z; this.z = x*v.y - y*v.x;
    return this;
  }
  applyQuat(q) {
    const {x,y,z} = this, {x:qx,y:qy,z:qz,w:qw} = q;
    const ix= qw*x+qy*z-qz*y, iy= qw*y+qz*x-qx*z, iz= qw*z+qx*y-qy*x, iw=-qx*x-qy*y-qz*z;
    this.x = ix*qw+iw*(-qx)+iy*(-qz)-iz*(-qy);
    this.y = iy*qw+iw*(-qy)+iz*(-qx)-ix*(-qz);
    this.z = iz*qw+iw*(-qz)+ix*(-qy)-iy*(-qx);
    return this;
  }
  toArray() { return [this.x, this.y, this.z]; }
}

export class Quat {
  constructor(x=0,y=0,z=0,w=1) { this.x=x; this.y=y; this.z=z; this.w=w; }
  clone()    { return new Quat(this.x,this.y,this.z,this.w); }
  copy(q)    { this.x=q.x; this.y=q.y; this.z=q.z; this.w=q.w; return this; }
  identity() { this.x=0; this.y=0; this.z=0; this.w=1; return this; }
  multiply(b) {
    const {x:ax,y:ay,z:az,w:aw}=this, {x:bx,y:by,z:bz,w:bw}=b;
    this.x=aw*bx+ax*bw+ay*bz-az*by; this.y=aw*by-ax*bz+ay*bw+az*bx;
    this.z=aw*bz+ax*by-ay*bx+az*bw; this.w=aw*bw-ax*bx-ay*by-az*bz;
    return this;
  }
  static fromAxisAngle(axis, angle) {
    const s = Math.sin(angle/2);
    return new Quat(axis.x*s, axis.y*s, axis.z*s, Math.cos(angle/2));
  }
  static fromUnitVectors(a, b) {
    const dot = a.dot(b);
    if (dot >= 1-1e-8) return new Quat();
    if (dot <= -1+1e-8) {
      let p = new Vec3(1,0,0);
      if (Math.abs(a.x)>0.9) p = new Vec3(0,1,0);
      p.sub(a.clone().scale(a.dot(p))).normalize();
      return Quat.fromAxisAngle(p, Math.PI);
    }
    const c = new Vec3(a.x,a.y,a.z).cross(b);
    return new Quat(c.x,c.y,c.z,1+dot).normalize();
  }
  normalize() {
    const l = Math.sqrt(this.x**2+this.y**2+this.z**2+this.w**2);
    if (l>1e-8){this.x/=l;this.y/=l;this.z/=l;this.w/=l;}
    return this;
  }
  slerp(target, alpha) {
    let dot = this.x*target.x+this.y*target.y+this.z*target.z+this.w*target.w;
    if (dot<0){target=target.clone().scale(-1);dot=-dot;}
    if (dot>0.9995) {
      this.x+=(target.x-this.x)*alpha; this.y+=(target.y-this.y)*alpha;
      this.z+=(target.z-this.z)*alpha; this.w+=(target.w-this.w)*alpha;
      return this.normalize();
    }
    const th0=Math.acos(dot), th=th0*alpha;
    const s0=Math.cos(th)-dot*Math.sin(th)/Math.sin(th0), s1=Math.sin(th)/Math.sin(th0);
    this.x=s0*this.x+s1*target.x; this.y=s0*this.y+s1*target.y;
    this.z=s0*this.z+s1*target.z; this.w=s0*this.w+s1*target.w;
    return this;
  }
  scale(s) { this.x*=s;this.y*=s;this.z*=s;this.w*=s; return this; }
  toArray() { return [this.x,this.y,this.z,this.w]; }
}

export function makeRNG(seed) {
  let s = Math.abs(seed) % 2147483647 || 1;
  return () => (s = s * 16807 % 2147483647) / 2147483647;
}
