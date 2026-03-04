/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import Analytics from './pages/Analytics';
import Assets from './pages/Assets';
import ChecklistAssignmentEditor from './pages/ChecklistAssignmentEditor';
import ChecklistEditor from './pages/ChecklistEditor';
import ChecklistHistory from './pages/ChecklistHistory';
import Checklists from './pages/Checklists';
import Dashboard from './pages/Dashboard';
import DevChecklist from './pages/DevChecklist';
import EmergencySOPs from './pages/EmergencySOPs';
import ExternalLinks from './pages/ExternalLinks';
import IncidentReports from './pages/IncidentReports';
import Maintenance from './pages/Maintenance';
import SOPAssistant from './pages/SOPAssistant';
import SOPDetail from './pages/SOPDetail';
import SOPEditor from './pages/SOPEditor';
import SOPVersions from './pages/SOPVersions';
import SOPs from './pages/SOPs';
import Settings from './pages/Settings';
import Tasks from './pages/Tasks';
import Teams from './pages/Teams';
import UserManagement from './pages/UserManagement';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Analytics": Analytics,
    "Assets": Assets,
    "ChecklistAssignmentEditor": ChecklistAssignmentEditor,
    "ChecklistEditor": ChecklistEditor,
    "ChecklistHistory": ChecklistHistory,
    "Checklists": Checklists,
    "Dashboard": Dashboard,
    "DevChecklist": DevChecklist,
    "EmergencySOPs": EmergencySOPs,
    "ExternalLinks": ExternalLinks,
    "IncidentReports": IncidentReports,
    "Maintenance": Maintenance,
    "SOPAssistant": SOPAssistant,
    "SOPDetail": SOPDetail,
    "SOPEditor": SOPEditor,
    "SOPVersions": SOPVersions,
    "SOPs": SOPs,
    "Settings": Settings,
    "Tasks": Tasks,
    "Teams": Teams,
    "UserManagement": UserManagement,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};