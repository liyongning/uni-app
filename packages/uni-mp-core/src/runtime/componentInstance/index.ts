import { EventChannel, invokeArrayFns } from '@dcloudio/uni-shared'
import { capitalize, hasOwn, isArray } from '@vue/shared'
import { ComponentPublicInstance, ComponentInternalInstance } from 'vue'
import { getEventChannel } from '../../api/protocols/navigateTo'
import { MPComponentInstance } from '../component'

const MP_METHODS = [
  'createSelectorQuery',
  'createIntersectionObserver',
  'selectAllComponents',
  'selectComponent',
]

function createEmitFn(oldEmit: Function, ctx: Record<string, any>) {
  return function emit(
    this: ComponentPublicInstance,
    event: string,
    ...args: any[]
  ) {
    if (ctx.$scope && event) {
      ;(ctx.$scope as any).triggerEvent(event, { __args__: args })
    }
    if (__PLATFORM__ === 'mp-alipay') {
      const vnode = this.$.vnode
      const props = vnode && vnode.props
      if (props && props[`on${capitalize(event)}`]) {
        return
      }
    }
    return oldEmit.apply(this, [event, ...args])
  }
}

export interface CreateComponentOptions {
  mpType: 'app' | 'page' | 'component'
  mpInstance: any
  slots?: string[]
  parentComponent?: ComponentInternalInstance
  onBeforeSetup?: Function
}

export function initBaseInstance(
  instance: ComponentInternalInstance,
  options: CreateComponentOptions
) {
  const ctx = (instance as any).ctx

  // mp
  ctx.mpType = options.mpType // @deprecated
  ctx.$mpType = options.mpType
  ctx.$scope = options.mpInstance

  // TODO @deprecated
  ctx.$mp = {}
  if (__VUE_OPTIONS_API__) {
    ctx._self = {}
  }

  // $vm
  ctx.$scope.$vm = (instance as any).proxy!

  // slots
  if (__PLATFORM__ === 'mp-alipay') {
    Object.defineProperty(instance, 'slots', {
      get() {
        return this.$scope && this.$scope.props.$slots
      },
    })
  } else {
    instance.slots = {}
    if (isArray(options.slots) && options.slots.length) {
      options.slots.forEach((name) => {
        instance.slots[name] = true as any
      })
    }
  }

  ctx.getOpenerEventChannel = function () {
    // 微信小程序使用自身getOpenerEventChannel
    if (__PLATFORM__ === 'mp-weixin') {
      return options.mpInstance.getOpenerEventChannel()
    }
    if (!this.__eventChannel__) {
      this.__eventChannel__ = new EventChannel()
    }
    return this.__eventChannel__
  }

  ctx.$hasHook = hasHook
  ctx.$callHook = callHook

  // $emit
  instance.emit = createEmitFn(instance.emit, ctx)
}

export function initComponentInstance(
  instance: ComponentInternalInstance,
  options: CreateComponentOptions
) {
  initBaseInstance(instance, options)

  const ctx = (instance as any).ctx
  MP_METHODS.forEach((method) => {
    ctx[method] = function (...args: any[]) {
      const mpInstance = ctx.$scope as MPComponentInstance
      if (mpInstance && mpInstance[method]) {
        return (mpInstance[method] as Function).apply(mpInstance, args)
      }
      if (__PLATFORM__ === 'mp-alipay') {
        return (my as any)[method] && (my as any)[method].apply(my, args)
      }
    }
  })
}

export function initMocks(
  instance: ComponentInternalInstance,
  mpInstance: MPComponentInstance,
  mocks: string[]
) {
  const ctx = (instance as any).ctx
  mocks.forEach((mock) => {
    if (hasOwn(mpInstance, mock)) {
      ctx[mock] = mpInstance[mock]
    }
  })
}

function hasHook(this: ComponentPublicInstance, name: string) {
  const hooks = (this.$ as any)[name]
  if (hooks && hooks.length) {
    return true
  }
  return false
}

function callHook(this: ComponentPublicInstance, name: string, args?: unknown) {
  if (name === 'mounted') {
    callHook.call(this, 'bm') // beforeMount
    this.$.isMounted = true
    name = 'm'
  } else if (name === 'onLoad' && args && (args as any).__id__) {
    ;(this as any).__eventChannel__ = getEventChannel((args as any).__id__)
    delete (args as any).__id__
  }
  const hooks = (this.$ as any)[name]
  return hooks && invokeArrayFns(hooks, args)
}
