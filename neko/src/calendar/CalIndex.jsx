import { useOutletContext } from "react-router-dom"
import Layout from "./Layout"

function CalIndex() {
  // Get context from AppLayout's Outlet
  const { selectedProject, session } = useOutletContext();

  return (
    <>
      <Layout selectedProject={selectedProject} session={session} />
    </>
  )
}

export default CalIndex