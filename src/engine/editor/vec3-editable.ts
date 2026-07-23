/**
 * UI-oriented editable vec3 / euler helpers (inspector fields).
 * Pure math quaternions stay in math/; this is the editor-facing view model.
 */
export {
  type EulerDeg,
  type Vec3Editable,
  vec3ToEditable,
  editableToVec3,
  quatToEulerDeg,
  eulerDegToQuat,
} from '../math/euler';
