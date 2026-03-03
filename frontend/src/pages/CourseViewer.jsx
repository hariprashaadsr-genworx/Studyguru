import React, { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { loadCourse } from '../store/courseSlice'
import ViewerTopBar  from '../components/ViewerTopBar'
import CourseSidebar from '../components/CourseSidebar'
import VideoBar      from '../components/VideoBar'
import SlideView     from '../components/SlideView'
import RefsPanel     from '../components/RefsPanel'

function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="flex-1 flex items-center justify-center bg-white">
      <div className="text-center px-8 max-w-sm">
        <div className="text-[56px] mb-5 animate-float">📭</div>
        <h2 className="font-display text-[22px] font-bold text-gray-900 mb-2">Course not found</h2>
        <p className="text-gray-500 text-[14px] mb-7">This course may have been deleted or the link is invalid.</p>
        <button onClick={() => navigate('/dashboard')}
          className="px-6 py-2.5 rounded-lg font-semibold bg-accent text-white hover:bg-accent2 shadow-glow transition">
          ← Back to Dashboard
        </button>
      </div>
    </div>
  )
}

export default function CourseViewer() {
  const { courseId } = useParams()
  const dispatch     = useDispatch()
  const navigate     = useNavigate()
  const { data, status, error, flatNav, navIdx } = useSelector((s) => s.course)

  useEffect(() => { dispatch(loadCourse(courseId)) }, [courseId, dispatch])

  const currentItem = flatNav[navIdx]
  const currentMod  = data && currentItem ? data.modules[currentItem.mi] : null
  const videos      = currentMod?.youtube_videos || []

  return (
    /* Overall page: dark nav + sidebar, white content area */
    <div className="flex h-screen overflow-hidden" style={{ background: '#f8f9fa' }}>
      <ViewerTopBar />
      <CourseSidebar />

      {/*
        Content area:
        - margin-left = sidebar width (280px)
        - margin-top  = topbar height (56px)
        - takes up ALL remaining width and height
        - white background
      */}
      <div
        className="flex flex-col flex-1 overflow-y-auto"
        style={{
          marginLeft: '280px',
          marginTop:  '56px',
          minHeight:  'calc(100vh - 56px)',
          background: '#ffffff',
        }}
      >
        {status === 'loading' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-10 h-10 border-2 border-gray-200 border-t-accent rounded-full animate-spin-slow mx-auto mb-4" />
              <p className="text-gray-400 text-[14px]">Loading course…</p>
            </div>
          </div>
        )}

        {status === 'failed' && (
          error === 'Course not found' ? <NotFound /> : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center px-8 max-w-sm">
                <div className="text-[48px] mb-4">⚠</div>
                <h2 className="font-display text-[20px] font-bold text-gray-900 mb-3">Something went wrong</h2>
                <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[13px] mb-5">{error}</div>
                <button onClick={() => dispatch(loadCourse(courseId))}
                  className="px-5 py-2.5 rounded-lg font-semibold bg-accent text-white hover:bg-accent2 transition">
                  Try Again
                </button>
              </div>
            </div>
          )
        )}

        {status === 'succeeded' && (
          <>
            <VideoBar videos={videos} />
            {currentItem?.type === 'slide' && <SlideView />}
            {currentItem?.type === 'refs'  && <RefsPanel />}
          </>
        )}
      </div>
    </div>
  )
}
