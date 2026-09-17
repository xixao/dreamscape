// Portable uncompressed ZIP; no external service or dependency needed.
export function packageZip(files:Record<string,string>):Blob {
  const encoder=new TextEncoder(); const chunks:Uint8Array<ArrayBuffer>[]=[]; const directory:Uint8Array<ArrayBuffer>[]=[]; let offset=0;
  const crc=(bytes:Uint8Array)=>{let n=0xffffffff;for(const byte of bytes){n^=byte;for(let k=0;k<8;k++)n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^0xffffffff)>>>0;};
  for(const [path,content] of Object.entries(files)) {
    const name=encoder.encode(path),data=encoder.encode(content),sum=crc(data);
    const header=new Uint8Array(30+name.length);const h=new DataView(header.buffer);
    h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint32(14,sum,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,name.length,true);header.set(name,30);
    const central=new Uint8Array(46+name.length);const c=new DataView(central.buffer);
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint32(16,sum,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);central.set(name,46);
    chunks.push(header,data);directory.push(central);offset+=header.length+data.length;
  }
  const end=new Uint8Array(22);const e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,directory.length,true);e.setUint16(10,directory.length,true);e.setUint32(12,directory.reduce((n,x)=>n+x.length,0),true);e.setUint32(16,offset,true);
  return new Blob([...chunks,...directory,end],{type:'application/zip'});
}
