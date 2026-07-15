import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import L from 'leaflet'
import Papa from 'papaparse'
import type { FeatureCollection, Point } from 'geojson'
import 'leaflet/dist/leaflet.css'

type StationRow = {
  시설명: string
  시도명: string
  시군구명: string
  소재지도로명주소: string
  소재지지번주소: string
  위도: string
  경도: string
  설치장소설명: string
  평일운영시작시각: string
  평일운영종료시각: string
  동시사용가능대수: string
  공기주입가능여부: string
  휴대전화충전가능여부: string
  관리기관명: string
  관리기관전화번호: string
}

type StationProperties = {
  name: string
  region: string
  district: string
  address: string
  location: string
  hours: string
  capacity: string
  airPump: string
  phoneCharging: string
  manager: string
  phone: string
}

const createPopup = (properties: StationProperties) => {
  const wrapper = document.createElement('div')
  wrapper.className = 'station-popup'

  const title = document.createElement('strong')
  title.textContent = properties.name || '시설명 없음'
  wrapper.appendChild(title)

  const details = [
    ['주소', properties.address],
    ['설치 위치', properties.location],
    ['평일 운영', properties.hours],
    ['동시 사용', properties.capacity ? `${properties.capacity}대` : '정보 없음'],
    ['공기 주입', properties.airPump === 'Y' ? '가능' : '불가'],
    ['휴대전화 충전', properties.phoneCharging === 'Y' ? '가능' : '불가'],
    ['관리기관', properties.manager],
    ['전화', properties.phone],
  ]

  for (const [label, value] of details) {
    if (!value) continue
    const row = document.createElement('p')
    const labelElement = document.createElement('span')
    labelElement.textContent = `${label}: `
    row.append(labelElement, document.createTextNode(value))
    wrapper.appendChild(row)
  }
  return wrapper
}

export default function ChargingStationMap() {
  const pageRef = useRef<HTMLElement>(null)
  const mapElementRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null)
  const resizingRef = useRef(false)
  const [stations, setStations] = useState<FeatureCollection<Point, StationProperties>>({ type: 'FeatureCollection', features: [] })
  const [selectedRegion, setSelectedRegion] = useState('전체')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sidebarWidth, setSidebarWidth] = useState(10)
  const [isResizing, setIsResizing] = useState(false)

  const updateSidebarWidth = (clientX: number) => {
    const bounds = pageRef.current?.getBoundingClientRect()
    if (!bounds) return
    const nextWidth = ((clientX - bounds.left) / bounds.width) * 100
    setSidebarWidth(Math.min(40, Math.max(8, nextWidth)))
  }

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    resizingRef.current = true
    setIsResizing(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    updateSidebarWidth(event.clientX)
  }

  const resize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (resizingRef.current) updateSidebarWidth(event.clientX)
  }

  const stopResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    resizingRef.current = false
    setIsResizing(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const resizeWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const amount = event.shiftKey ? 5 : 1
    setSidebarWidth((current) => Math.min(40, Math.max(8, current + (event.key === 'ArrowRight' ? amount : -amount))))
  }

  const regionCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const feature of stations.features) {
      const region = feature.properties.region
      counts.set(region, (counts.get(region) ?? 0) + 1)
    }
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b, 'ko'))
  }, [stations])

  const visibleStations = useMemo<FeatureCollection<Point, StationProperties>>(() => ({
    type: 'FeatureCollection',
    features: selectedRegion === '전체'
      ? stations.features
      : stations.features.filter((feature) => feature.properties.region === selectedRegion),
  }), [selectedRegion, stations])

  useEffect(() => {
    const loadCsv = async () => {
      try {
        const response = await fetch('/data/location.csv')
        if (!response.ok) throw new Error('충전기 위치 CSV 파일을 불러오지 못했습니다.')
        const buffer = await response.arrayBuffer()
        const csv = new TextDecoder('euc-kr').decode(buffer)
        const parsed = Papa.parse<StationRow>(csv, { header: true, skipEmptyLines: true })
        if (parsed.errors.length && !parsed.data.length) throw new Error(parsed.errors[0].message)

        const features = parsed.data.flatMap((row, index) => {
          const latitude = Number.parseFloat(row.위도)
          const longitude = Number.parseFloat(row.경도)
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return []
          return [{
            type: 'Feature' as const,
            id: index,
            geometry: { type: 'Point' as const, coordinates: [longitude, latitude] },
            properties: {
              name: row.시설명,
              region: row.시도명,
              district: row.시군구명,
              address: row.소재지도로명주소 || row.소재지지번주소,
              location: row.설치장소설명,
              hours: row.평일운영시작시각 && row.평일운영종료시각 ? `${row.평일운영시작시각}–${row.평일운영종료시각}` : '',
              capacity: row.동시사용가능대수,
              airPump: row.공기주입가능여부,
              phoneCharging: row.휴대전화충전가능여부,
              manager: row.관리기관명,
              phone: row.관리기관전화번호,
            },
          }]
        })
        setStations({ type: 'FeatureCollection', features })
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : '위치 데이터를 처리하지 못했습니다.')
      } finally {
        setLoading(false)
      }
    }
    void loadCsv()
  }, [])

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return
    const map = L.map(mapElementRef.current, { center: [36.3, 127.8], zoom: 7, minZoom: 6 })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || loading) return
    geoJsonLayerRef.current?.remove()

    const layer = L.geoJSON(visibleStations, {
      pointToLayer: (_feature, latlng) => L.circleMarker(latlng, {
        radius: 6,
        color: '#16543d',
        weight: 1.5,
        fillColor: '#35a26f',
        fillOpacity: 0.78,
      }),
      onEachFeature: (feature, featureLayer) => {
        featureLayer.bindPopup(createPopup(feature.properties as StationProperties), { maxWidth: 310 })
      },
    }).addTo(map)
    geoJsonLayerRef.current = layer

    const bounds = layer.getBounds()
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28], maxZoom: selectedRegion === '전체' ? 8 : 12 })
    window.setTimeout(() => map.invalidateSize(), 0)
  }, [loading, selectedRegion, visibleStations])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => mapRef.current?.invalidateSize({ pan: false }))
    return () => window.cancelAnimationFrame(frame)
  }, [sidebarWidth])

  return (
    <main
      ref={pageRef}
      className={`location-page${isResizing ? ' is-resizing' : ''}`}
      style={{ '--sidebar-width': `${sidebarWidth}%` } as CSSProperties}
    >
      <aside className="location-sidebar">
        <div><p className="eyebrow">ACCESSIBILITY MAP</p><h1>전동휠체어<br />급속충전기</h1><p>전국 공공 충전시설의 위치를 지도에서 확인하세요.</p></div>
        <label htmlFor="region-select">지역 선택
          <select id="region-select" value={selectedRegion} onChange={(event) => setSelectedRegion(event.target.value)}>
            <option value="전체">전체 ({stations.features.length.toLocaleString()}개)</option>
            {regionCounts.map(([region, count]) => <option value={region} key={region}>{region} ({count.toLocaleString()}개)</option>)}
          </select>
        </label>
        <div className="location-summary"><span className="location-marker-dot" /><div><strong>{visibleStations.features.length.toLocaleString()}</strong><small>표시 중인 충전기</small></div></div>
        <p className="coordinate-note">좌표계 EPSG:4326<br />위도·경도 기반 GeoJSON</p>
      </aside>
      <div
        className="map-resizer"
        role="separator"
        aria-label="지역 선택 영역 너비 조절"
        aria-orientation="vertical"
        aria-valuemin={8}
        aria-valuemax={40}
        aria-valuenow={Math.round(sidebarWidth)}
        tabIndex={0}
        onPointerDown={startResize}
        onPointerMove={resize}
        onPointerUp={stopResize}
        onPointerCancel={stopResize}
        onKeyDown={resizeWithKeyboard}
        onDoubleClick={() => setSidebarWidth(10)}
        title="드래그하여 너비 조절 · 더블클릭하여 초기화"
      ><span /></div>
      <section className="map-panel" aria-label="전국 전동휠체어 급속충전기 지도">
        <div ref={mapElementRef} className="charging-map" />
        {loading && <div className="map-status"><div className="loader" /><p>4,191개 위치를 불러오는 중입니다.</p></div>}
        {error && <div className="map-status map-error"><p>{error}</p></div>}
        {!loading && !error && <div className="map-count-badge">{selectedRegion} · {visibleStations.features.length.toLocaleString()}개</div>}
      </section>
    </main>
  )
}
