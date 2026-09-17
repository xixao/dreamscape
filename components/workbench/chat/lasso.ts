export type Point = { x: number; y: number };
type Box = { left: number; top: number; width: number; height: number };
function cross(a: Point, b: Point, p: Point) { return (b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x); }
function contains(points: Point[], p: Point) {
  let inside = false;
  for (let i=0,j=points.length-1;i<points.length;j=i++) {
    const a=points[j],b=points[i];
    if (Math.abs(cross(a,b,p)) < 0.001 && p.x >= Math.min(a.x,b.x) && p.x <= Math.max(a.x,b.x) && p.y >= Math.min(a.y,b.y) && p.y <= Math.max(a.y,b.y)) return true;
    if ((a.y>p.y)!==(b.y>p.y) && p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
}
/** Close the freehand stroke implicitly; exclude partially enclosed ancestors. */
export function lassoEncloses(points: Point[], box: Box) {
  if (points.length < 3 || box.width <= 0 || box.height <= 0) return false;
  const corners=[{x:box.left,y:box.top},{x:box.left+box.width,y:box.top},{x:box.left+box.width,y:box.top+box.height},{x:box.left,y:box.top+box.height}];
  if (!corners.every(p=>contains(points,p))) return false;
  // A concave stroke may cut through a component even with all corners inside.
  for (let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length];
    if (a.x>box.left && a.x<box.left+box.width && a.y>box.top && a.y<box.top+box.height) return false;
    for (let j=0;j<4;j++) {
      const c=corners[j],d=corners[(j+1)%4];
      if (cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0) return false;
    }
  }
  return true;
}
