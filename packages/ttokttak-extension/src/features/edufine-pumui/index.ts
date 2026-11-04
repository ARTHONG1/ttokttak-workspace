/** 에듀파인 품의: the first task of 똑딱작업실 (names in core/registry.ts) */
import type { Feature } from '../../core/feature'
import { featureInfo } from '../../core/registry'
import { openPumui } from './panel'

export const edufinePumui: Feature = { ...featureInfo('edufine-pumui')!, open: openPumui }
