
export type IStoreage<T=any>={
    get:(key:string)=>T |  undefined| Promise<T| undefined>
    set:(key:string,value:T )=>void | Promise<void>
    delete:(key:string)=>void | Promise<void>
    clear:()=>void | Promise<void>
}

let defaultStorage:Map<string,any>  | undefined = undefined

function initStorage(){
    if(!defaultStorage) defaultStorage = new Map<string,any>()
}

export const MapStorage = {
    get:(key:string)=>{
        initStorage()
        return defaultStorage!.get(key)
    },
    set:(key:string,value:any )=>{
        initStorage()
        defaultStorage!.set(key,value)
    },
    delete:(key:string)=>{
        initStorage()
        defaultStorage!.delete(key)
    },
    clear:()=>{
        initStorage()
        defaultStorage!.clear()
    }

}