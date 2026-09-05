import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { getPublicCatalog, type PublicCatalogListing } from '@/api/publicMarketplace';
import { LiveMarketplaceListingCard } from '@/components/live-marketplace-listing-card';
import { Screen } from '@/components/screen';
import { CatalogFilters, marketplaceFilterParams, type MarketplaceFilters } from '@/features/freight/catalog-filters';
import { useTheme } from '@/theme/theme-provider';
import { useTranslation } from '@/i18n/use-translation';
import { guestMarketplaceCopy, guestMarketplaceLabels } from '../../../../../shared/guest-marketplace-copy';
import { publicMarketplaceSection } from '../../../../../shared/public-marketplace-sections';
import type { AppTabParamList } from '@/types/navigation';

export type CatalogReturn = { filters: MarketplaceFilters; section: string };
// Build an explicit two-screen history so OS back and the visible back button both
// return to the exact catalogue used before sign-in.
export function openCatalogListing(navigation: BottomTabNavigationProp<AppTabParamList>, listing: {id:string;kind:string}, catalog: CatalogReturn) {
 const route = listing.kind === 'VEHICLE' ? {tab:'VehicleMarketplace',home:'VehicleSearch',detail:'VehicleDetails'} as const
  : listing.kind === 'DRIVER' ? {tab:'DriverMarketplace',home:'DriverSearch',detail:'DriverDetails'} as const
  : {tab:'FindLoads',home:'FindLoadsHome',detail:'FreightDetails'} as const;
 const state={index:1,routes:[{name:route.home,params:{initialCatalog:catalog}},{name:route.detail,params:{listingId:listing.id}}]};
 if(route.tab==='FindLoads') navigation.navigate('FindLoads',{state});
 else if(route.tab==='VehicleMarketplace') navigation.navigate('VehicleMarketplace',{state});
 else navigation.navigate('DriverMarketplace',{state});
}

export function CatalogReturnScreen({initialCatalog}:{initialCatalog:CatalogReturn}) {
 const theme=useTheme(),{locale,t}=useTranslation(),copy=guestMarketplaceCopy(locale);
 const navigation=useNavigation();
 const [filters,setFilters]=useState(initialCatalog.filters),[items,setItems]=useState<PublicCatalogListing[]>([]);
 const [next,setNext]=useState<string|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(false);
 const generation=useRef(0);
 const section=publicMarketplaceSection(initialCatalog.section),scope='scope' in section?section.scope:'GLOBAL';
 const query=marketplaceFilterParams(filters);
 const load=useCallback(async(before?:string)=>{
  const run=++generation.current;setLoading(true);setError(false);
  try { const result=await getPublicCatalog(`scope=${scope}&${query}&limit=60${before?`&before=${encodeURIComponent(before)}`:''}`);
   if(run!==generation.current)return;
   setItems(current=>before?[...new Map([...current,...result.items].map(item=>[`${item.kind}:${item.id}`,item])).values()]:result.items);setNext(result.nextCursor);
  }catch{if(run===generation.current)setError(true);}finally{if(run===generation.current)setLoading(false);}
 },[scope,query]);
 useFocusEffect(useCallback(()=>{void load();return()=>{generation.current+=1;};},[load]));
 return <Screen><FlatList data={items} keyExtractor={item=>`${item.kind}:${item.id}`} contentContainerStyle={{padding:18,gap:14,paddingBottom:120}}
  ListHeaderComponent={<View style={{gap:18,marginBottom:16}}><Text style={{fontSize:26,fontWeight:'900',color:theme.text}}>{section.id==='overview'?t('liveListings'):guestMarketplaceLabels(locale).labels[section.id]}</Text><CatalogFilters value={filters} onApply={value=>{setItems([]);setNext(null);setFilters(value);}} />{error?<Pressable onPress={()=>void load()}><Text style={{color:theme.danger}}>{copy.loadError}</Text></Pressable>:null}</View>}
  renderItem={({item})=><LiveMarketplaceListingCard listing={item} onPress={()=>{const parent=navigation.getParent<BottomTabNavigationProp<AppTabParamList>>();if(parent)openCatalogListing(parent,item,{...initialCatalog,filters});}} />}
  ListEmptyComponent={loading?<ActivityIndicator color={theme.primary}/>:!error?<Text style={{color:theme.muted}}>{copy.empty}</Text>:null}
  ListFooterComponent={next?<Pressable disabled={loading} onPress={()=>void load(next)} style={{minHeight:48,justifyContent:'center'}}><Text style={{color:theme.primary}}>{copy.more}</Text></Pressable>:null}
 /></Screen>;
}
