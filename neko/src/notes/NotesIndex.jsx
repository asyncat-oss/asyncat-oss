import NotesLayout from "./Layout";
import { NoteProvider } from "./context/NoteProvider";

function NotesIndex({ session, selectedProject }) {
  return (
    <NoteProvider session={session}>
      <NotesLayout selectedProject={selectedProject}/>
    </NoteProvider>
  );
}

export default NotesIndex;