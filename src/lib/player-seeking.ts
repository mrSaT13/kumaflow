let isUserSeeking = false

export function setUserSeeking(value: boolean) {
  isUserSeeking = value
}

export function getUserSeeking() {
  return isUserSeeking
}
