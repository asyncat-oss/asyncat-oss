import NotesLayout from "./Layout";
import { NoteProvider } from "./context/NoteProvider";

function NotesIndex() {
  return (
    <NoteProvider>
      <NotesLayout />
    </NoteProvider>
  );
}

export default NotesIndex;
