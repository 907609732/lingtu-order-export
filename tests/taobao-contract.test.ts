import { describe,it,expect } from 'vitest'
import { taobaoListData,taobaoMonths,taobaoNextPage } from '../src/main/taobao-contract'

const response=(control:any,pagination?:any)=>({data:{data:{...(pagination?{pagination:{fields:pagination}}:{})},global:{pageControl:control}}})
describe('installed Taobao request and pagination contract',()=>{
  it('covers all intersecting months in reverse order including year and leap boundaries',()=>{
    expect(taobaoMonths('2023-12-31','2024-03-01')).toEqual(['2024-03','2024-02','2024-01','2023-12'])
    const data=taobaoListData('2024-02',3),condition=JSON.parse(data.condition)
    expect(data.OrderType).toBe('OrderFilter');expect(data.page).toBe(3)
    expect(condition.directRouteToTm2Scene).toBe('1')
    expect(JSON.parse(condition.orderFilterExtParam)).toEqual({beginTime:'2024-02-01 00:00:00',endTime:'2024-02-29 23:59:59'})
  })
  it('honors the platform next page rather than incrementing blindly',()=>{
    expect(taobaoNextPage(response({hasMore:true,nextPageIndex:5}),2,10)).toBe(5)
    expect(taobaoNextPage(response(undefined,{hasMore:'true',currentPage:'3'}),3,10)).toBe(4)
  })
  it('ends on explicit flags even without totals',()=>{
    expect(taobaoNextPage(response({hasMore:'false'}),1,8)).toBeNull()
    expect(taobaoNextPage(response({emptyPage:'true'}),1,0)).toBeNull()
    expect(taobaoNextPage(response(undefined,{hasMore:false}),2,8)).toBeNull()
  })
  it('supports older total based responses',()=>{
    expect(taobaoNextPage(response({},{totalNum:31,pageSize:30}),1,30)).toBe(2)
    expect(taobaoNextPage(response({},{totalNum:31,pageSize:30}),2,1)).toBeNull()
  })
  it('keeps invalid or repeated pagination from being reported as completion',()=>{
    for(const control of [{hasMore:true,nextPageIndex:1},{hasMore:true,nextPageIndex:0},{hasMore:true,nextPageIndex:'bad'},{}])expect(()=>taobaoNextPage(response(control),1,1)).toThrow()
    expect(()=>taobaoNextPage(response({hasMore:true,nextPageIndex:2}),1,0)).toThrow()
    expect(()=>taobaoNextPage({},1,0)).toThrow()
    for(const totalNum of ['',null,-1,'x'])expect(()=>taobaoNextPage(response({},{totalNum,pageSize:20}),1,20)).toThrow()
    expect(()=>taobaoNextPage(response({hasMore:false},{currentPage:1}),3,20)).toThrow()
  })
})
