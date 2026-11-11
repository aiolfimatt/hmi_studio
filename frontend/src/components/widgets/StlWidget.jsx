import React, { useEffect, useRef, useState } from 'react'
import { Box } from 'lucide-react'

export default function StlWidget({ widgetProps = {} }) {
  const {
    src        = '',
    modelColor = '#4a90d9',
    background = '#1e1e2e',
    wireframe  = false,
  } = widgetProps

  const mountRef = useRef(null)
  const [status, setStatus]   = useState('idle')
  const [errMsg, setErrMsg]   = useState('')

  useEffect(() => {
    if (!src || !mountRef.current) return

    let alive    = true
    let renderer = null
    let animId   = null
    let controls = null
    let disposeGeom = null
    let disposeMat  = null
    let ro          = null

    ;(async () => {
      setStatus('loading')
      try {
        const THREE = await import('three')
        const { STLLoader }     = await import('three/examples/jsm/loaders/STLLoader.js')
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')

        if (!alive) return

        const container = mountRef.current
        const W = container.clientWidth  || 300
        const H = container.clientHeight || 200

        const scene = new THREE.Scene()
        scene.background = new THREE.Color(background)

        const camera = new THREE.PerspectiveCamera(45, W / H, 0.01, 1e6)

        renderer = new THREE.WebGLRenderer({ antialias: true })
        renderer.setSize(W, H)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        container.appendChild(renderer.domElement)

        scene.add(new THREE.AmbientLight(0xffffff, 0.6))
        const dl1 = new THREE.DirectionalLight(0xffffff, 0.9)
        dl1.position.set(1, 2, 3)
        scene.add(dl1)
        const dl2 = new THREE.DirectionalLight(0xffffff, 0.3)
        dl2.position.set(-1, -1, -1)
        scene.add(dl2)

        controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping  = true
        controls.dampingFactor  = 0.1

        const geometry = await new Promise((resolve, reject) => {
          new STLLoader().load(src, resolve, undefined, reject)
        })
        if (!alive) { geometry.dispose(); return }

        geometry.computeBoundingBox()
        const box = geometry.boundingBox
        const center = new THREE.Vector3()
        box.getCenter(center)
        geometry.translate(-center.x, -center.y, -center.z)

        const size = new THREE.Vector3()
        box.getSize(size)
        const maxDim = Math.max(size.x, size.y, size.z)
        const fovRad = camera.fov * Math.PI / 180
        const dist   = (maxDim / (2 * Math.tan(fovRad / 2))) * 2.5

        camera.position.set(dist * 0.7, dist * 0.5, dist * 0.8)
        camera.near = dist / 1000
        camera.far  = dist * 100
        camera.updateProjectionMatrix()
        controls.maxDistance = dist * 8
        controls.update()

        const material = new THREE.MeshPhongMaterial({
          color:     new THREE.Color(modelColor),
          wireframe,
          specular:  0x222222,
          shininess: 60,
          side:      THREE.DoubleSide,
        })
        scene.add(new THREE.Mesh(geometry, material))

        const grid = new THREE.GridHelper(maxDim * 3, 12, 0x444444, 0x333333)
        grid.position.y = -size.y / 2
        scene.add(grid)

        disposeGeom = () => geometry.dispose()
        disposeMat  = () => material.dispose()

        setStatus('ready')

        const animate = () => {
          if (!alive) return
          animId = requestAnimationFrame(animate)
          controls.update()
          renderer.render(scene, camera)
        }
        animate()

        ro = new ResizeObserver(() => {
          if (!mountRef.current) return
          const w = mountRef.current.clientWidth
          const h = mountRef.current.clientHeight
          if (!w || !h) return
          camera.aspect = w / h
          camera.updateProjectionMatrix()
          renderer.setSize(w, h)
        })
        ro.observe(container)
      } catch (err) {
        if (!alive) return
        setStatus('error')
        setErrMsg(err?.message || 'Failed to load STL')
      }
    })()

    return () => {
      alive = false
      cancelAnimationFrame(animId)
      ro?.disconnect()
      controls?.dispose()
      disposeGeom?.()
      disposeMat?.()
      if (renderer) {
        const el = renderer.domElement
        if (el.parentNode) el.parentNode.removeChild(el)
        renderer.dispose()
      }
    }
  }, [src, modelColor, background, wireframe])

  if (!src) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1 border border-dashed border-gray-300 rounded">
        <Box size={18} className="text-gray-400" />
        <span className="text-[9px] text-gray-400 font-mono">No STL</span>
      </div>
    )
  }

  return (
    <div className="w-full h-full relative">
      <div ref={mountRef} className="w-full h-full" />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 pointer-events-none">
          <div className="w-5 h-5 border-2 border-[#1677ff] border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 pointer-events-none">
          <span className="text-[10px] text-red-500 font-mono px-2 text-center">{errMsg}</span>
        </div>
      )}
    </div>
  )
}
