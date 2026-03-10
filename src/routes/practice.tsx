let numbers = [1, 2, 3, 4, 5]

let doubled = numbers.map(x => x * 2)
console.log(doubled) // Output: [2, 4, 6, 8, 10]
let filtered = numbers.filter(x => x % 2 === 0)
console.log(filtered) // Output: [2, 4]
let sum = numbers.reduce((acc, x) => acc + x, 0)
console.log(sum) // Output: 15
