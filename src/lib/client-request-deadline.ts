// A deadline also covers requests waiting for the auth lock, before fetch starts.
export async function withClientDeadline<T>(operation: PromiseLike<T>, milliseconds=22_000): Promise<T> {
  let timer:ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([Promise.resolve(operation),new Promise<never>((_,reject)=>{
      timer=setTimeout(()=>reject(new Error('request_timeout')),milliseconds);
    })]);
  } finally {clearTimeout(timer!);}
}
