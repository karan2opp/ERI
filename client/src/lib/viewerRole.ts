import { createContext, useContext } from 'react';
import type { Role } from '../types';

/** The role of whoever is looking at the Admin area, so the role pickers show only what they may choose. */
export const ViewerRoleContext = createContext<Role>('USER');
export const useViewerRole = () => useContext(ViewerRoleContext);
