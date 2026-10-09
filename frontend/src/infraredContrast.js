export function contrastInfraredPixels(data){
 for(let i=0;i<data.length;i+=4){
  const gray=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];
  const visibility=Math.max(0,Math.min(1,(gray-72)/78));
  const contrast=Math.round(Math.max(0,Math.min(255,(gray-76)*2.15)));
  data[i]=data[i+1]=data[i+2]=contrast;data[i+3]=Math.round(data[i+3]*visibility*.9);
 }
 return data;
}
