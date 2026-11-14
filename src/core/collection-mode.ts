import type {PlatformId,CollectionMode} from '../shared/types'
export function normalizeCollectionMode(platform:PlatformId,mode:CollectionMode|undefined):CollectionMode {
 if(mode!==undefined&&mode!=='ordinary'&&mode!=='official-export')throw new Error('未知采集模式')
 if(mode==='official-export'&&platform!=='alibaba')throw new Error('官方导出模式仅支持1688')
 return mode||'ordinary'
}
