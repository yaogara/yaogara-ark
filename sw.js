const CACHE_NAME="yaogara-static-v1"
const IMMUTABLE_EXTENSIONS=[".css",".js",".woff2",".woff",".ttf",".png",".jpg",".jpeg",".gif",".svg",".webp",".avif",".json"]
self.addEventListener("install",(event)=>{event.waitUntil(caches.open(CACHE_NAME)),self.skipWaiting()})
self.addEventListener("activate",(event)=>{event.waitUntil(caches.keys().then((keys)=>Promise.all(keys.filter((key)=>key!==CACHE_NAME).map((key)=>caches.delete(key))))),self.clients.claim()})
self.addEventListener("fetch",(event)=>{const request=event.request
  if(request.method!=="GET"){return}
  const url=new URL(request.url)
  if(url.origin!==self.location.origin){return}
  if(url.pathname.endsWith(".html")){return}
  const shouldCache=url.pathname.startsWith("/static/")||IMMUTABLE_EXTENSIONS.some((ext)=>url.pathname.endsWith(ext))
  if(!shouldCache){return}
  event.respondWith((async()=>{const cache=await caches.open(CACHE_NAME)
    const cached=await cache.match(request)
    if(cached){return cached}
    try{
      const response=await fetch(request)
      if(!response||!response.ok){return response}
      const headers=new Headers(response.headers)
      headers.set("Cache-Control","public, max-age=31536000, immutable")
      const buffer=await response.clone().arrayBuffer()
      const init={status:response.status,statusText:response.statusText,headers}
      const cachedResponse=new Response(buffer.slice(0),init)
      cache.put(request,cachedResponse.clone())
      return new Response(buffer,init)
    }catch(error){
      const fallback=await cache.match(request)
      if(fallback){return fallback}
      throw error
    }
  })())
})