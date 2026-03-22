export class Branch {

constructor(parent, position, direction, length, radius){

this.parent = parent
this.children = []

this.position = position.clone()
this.direction = direction.clone().normalize()

this.growDir = new THREE.Vector3()
this.growCount = 0

this.length = length
this.radius = radius

}

end(){

return this.position.clone().add(
this.direction.clone().multiplyScalar(this.length)
)

}

reset(){

this.growDir.set(0,0,0)
this.growCount = 0

}

}

export function createTree(){

const attractors = []

const crownRadius = 4

for(let i=0;i<600;i++){

const pos = new THREE.Vector3(

(Math.random()-0.5)*crownRadius,
Math.random()*crownRadius + 2,
(Math.random()-0.5)*crownRadius

)

attractors.push(pos)

}

const root = new Branch(

null,
new THREE.Vector3(0,0,0),
new THREE.Vector3(0,1,0),
0.2,
0.12

)

return {

branches:[root],
attractors:attractors,

minDist:0.4,
maxDist:2.5,

segmentLength:0.25

}

}