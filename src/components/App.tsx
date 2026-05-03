import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Video, PlusCircle, LayoutGrid, Calendar, MoreVertical,
  Edit2, Trash2, Pencil, AlertTriangle
} from 'lucide-react';
import Workspace from './Workspace';
import { Project } from '@/src/types';
import { DEFAULT_TAGS } from '@/src/constants';

const App = () => {
  const [view, setView] = useState<'home' | 'workspace'>('home');
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);

  // Transient blob store for current session
  const [projectBlobs, setProjectBlobs] = useState<Map<string, string>>(new Map());

  // Editing state for projects
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{name: string, description: string}>({ name: '', description: '' });

  const createProject = (file: File) => {
      const newId = Date.now().toString();
      const url = URL.createObjectURL(file);

      const newProject: Project = {
          id: newId,
          name: file.name.split('.')[0] || 'Untitled Project',
          description: '',
          createdAt: Date.now(),
          lastModified: Date.now(),
          fileName: file.name,
          data: {
              shapes: [],
              freezeFrames: [],
              tags: DEFAULT_TAGS,
              tagEvents: [],
              playlists: [{ id: 'p1', name: 'Highlights', events: [] }, { id: 'p2', name: 'Defense', events: [] }],
              markers: []
          }
      };

      setProjects(prev => [newProject, ...prev]);
      setProjectBlobs(prev => new Map(prev).set(newId, url));
      setActiveProject(newProject);
      setView('workspace');
  };

  const deleteProject = (id: string) => {
      if (window.confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
          setProjects(prev => prev.filter(p => p.id !== id));
          setProjectBlobs(prev => {
              const newMap = new Map(prev);
              const url = newMap.get(id);
              if (url && typeof url === 'string') URL.revokeObjectURL(url);
              newMap.delete(id);
              return newMap;
          });
      }
  };

  const startEditingProject = (p: Project) => {
      setEditingProjectId(p.id);
      setEditForm({ name: p.name, description: p.description });
  };

  const saveEditingProject = () => {
      if (editingProjectId) {
          setProjects(prev => prev.map(p => p.id === editingProjectId ? { ...p, name: editForm.name, description: editForm.description, lastModified: Date.now() } : p));
          setEditingProjectId(null);
      }
  };

  const updateProjectData = (id: string, data: ProjectData) => {
      setProjects(prev => prev.map(p => p.id === id ? { ...p, data, lastModified: Date.now() } : p));
      // Also update active project ref to prevent stale state issues on re-render
      setActiveProject(prev => prev && prev.id === id ? { ...prev, data, lastModified: Date.now() } : prev);
  };

  const openProject = (project: Project) => {
      const blobUrl = projectBlobs.get(project.id);
      if (blobUrl) {
          setActiveProject(project);
          setView('workspace');
      } else {
          alert("Video source lost (Session refreshed). Please re-upload to resume project.");
      }
  };

  // --- Home Screen ---
  if (view === 'home') {
      return (
          <div className="w-screen h-screen bg-[#0a0a0a] text-white flex flex-col overflow-hidden">
             <div className="p-8 border-b border-[#222] flex justify-between items-center bg-[#111]">
                 <div className="flex items-center gap-3">
                     <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-emerald-500 rounded-lg flex items-center justify-center">
                         <Video className="w-6 h-6 text-white" />
                     </div>
                     <h1 className="text-2xl font-bold">RET MOTION <span className="text-gray-500 font-normal text-lg">Projects</span></h1>
                 </div>
                 <label className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium cursor-pointer transition-colors flex items-center gap-2">
                     <PlusCircle className="w-5 h-5" />
                     New Project
                     <input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && createProject(e.target.files[0])} />
                 </label>
             </div>

             <div className="flex-1 overflow-y-auto p-8">
                 {projects.length === 0 ? (
                     <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-4">
                         <LayoutGrid className="w-16 h-16 opacity-20" />
                         <p className="text-lg">No projects yet. Start by uploading a video.</p>
                     </div>
                 ) : (
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                         {projects.map(project => {
                             const hasSource = projectBlobs.has(project.id);
                             const isEditing = editingProjectId === project.id;
                             return (
                                 <motion.div
                                    key={project.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="bg-[#161616] border border-[#333] rounded-xl overflow-hidden hover:border-blue-500/50 transition-colors group"
                                 >
                                     <div className="p-5 space-y-4">
                                         <div className="flex justify-between items-start">
                                             <div className="flex-1 min-w-0">
                                                 {isEditing ? (
                                                     <input
                                                        className="bg-[#111] border border-[#333] rounded px-2 py-1 text-lg font-bold text-white focus:outline-none focus:border-blue-500 w-full mb-1"
                                                        value={editForm.name}
                                                        onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                                                        placeholder="Project Name"
                                                        autoFocus
                                                     />
                                                 ) : (
                                                     <div className="flex items-center gap-2">
                                                         <h3 className="text-lg font-bold text-white truncate">{project.name}</h3>
                                                         <button onClick={() => startEditingProject(project)} className="text-gray-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"><Pencil className="w-3.5 h-3.5" /></button>
                                                     </div>
                                                 )}

                                                 <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                                                     <Calendar className="w-3 h-3" />
                                                     {new Date(project.lastModified).toLocaleDateString()}
                                                 </div>
                                             </div>

                                             {!isEditing && (
                                                 <div className="relative group/menu shrink-0 ml-2">
                                                     <button className="p-2 text-gray-400 hover:text-white rounded hover:bg-[#222]">
                                                         <MoreVertical className="w-4 h-4" />
                                                     </button>
                                                     <div className="absolute right-0 top-full bg-[#222] border border-[#333] rounded shadow-xl py-1 w-32 hidden group-hover/menu:block z-10">
                                                         <button
                                                            onClick={() => startEditingProject(project)}
                                                            className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-[#333] flex items-center gap-2"
                                                         >
                                                             <Edit2 className="w-3 h-3" /> Edit
                                                         </button>
                                                         <button
                                                            onClick={() => deleteProject(project.id)}
                                                            className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-900/20 flex items-center gap-2"
                                                         >
                                                             <Trash2 className="w-3 h-3" /> Delete
                                                         </button>
                                                     </div>
                                                 </div>
                                             )}
                                         </div>

                                         {isEditing ? (
                                             <textarea
                                                 className="w-full bg-[#111] border border-[#333] rounded p-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500 resize-none h-20"
                                                 placeholder="Add description..."
                                                 value={editForm.description}
                                                 onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                                             />
                                         ) : (
                                             <p className="text-sm text-gray-400 line-clamp-3 h-20">
                                                 {project.description || "No description"}
                                             </p>
                                         )}

                                         <div className="flex justify-between items-center pt-2">
                                             {isEditing ? (
                                                 <div className="flex gap-2 w-full">
                                                     <button onClick={() => setEditingProjectId(null)} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm font-medium">Cancel</button>
                                                     <button onClick={saveEditingProject} className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium">Save</button>
                                                 </div>
                                             ) : (
                                                 <>
                                                     <div className="flex gap-2">
                                                         <div className="px-2 py-1 bg-[#222] rounded text-xs text-gray-400 border border-[#333]">
                                                             {project.data.tagEvents.length} Events
                                                         </div>
                                                         <div className="px-2 py-1 bg-[#222] rounded text-xs text-gray-400 border border-[#333]">
                                                             {project.data.shapes.length} Shapes
                                                         </div>
                                                     </div>
                                                     {hasSource ? (
                                                         <button
                                                            onClick={() => openProject(project)}
                                                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                                                         >
                                                             Open Project
                                                         </button>
                                                     ) : (
                                                         <label className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer">
                                                             Reload Video
                                                             <input
                                                                type="file"
                                                                accept="video/*"
                                                                className="hidden"
                                                                onChange={(e) => {
                                                                    if (e.target.files?.[0]) {
                                                                        const url = URL.createObjectURL(e.target.files[0]);
                                                                        setProjectBlobs(prev => new Map(prev).set(project.id, url));
                                                                    }
                                                                }}
                                                             />
                                                         </label>
                                                     )}
                                                 </>
                                             )}
                                         </div>
                                     </div>
                                 </motion.div>
                             );
                         })}
                     </div>
                 )}
             </div>
          </div>
      );
  }

  // --- Workspace ---
  const projectBlob = activeProject ? projectBlobs.get(activeProject.id) : null;
  if (!activeProject || !projectBlob) return null;

  return (
    <Workspace
        videoUrl={projectBlob}
        project={activeProject}
        onUpdateProject={(data) => updateProjectData(activeProject.id, data)}
        onClose={() => setView('home')}
    />
  );
};

export default App;
