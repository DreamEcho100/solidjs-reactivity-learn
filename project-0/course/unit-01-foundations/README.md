# Unit 1: Foundations of Reactivity

## Overview

Welcome to the first unit of the Solid.js Reactive System course! This unit establishes the foundational concepts you need to understand fine-grained reactivity. We'll explore what reactivity means, why it matters, and how signals form the basis of reactive programming.

## Learning Objectives

By the end of this unit, you will:

- ✅ Understand what reactive programming is and why it's useful
- ✅ Distinguish between push-based and pull-based reactive models
- ✅ Explain the difference between fine-grained and coarse-grained reactivity
- ✅ Understand the Observer pattern and dependency tracking
- ✅ Implement a basic signal system from scratch
- ✅ Recognize when and why to use reactive patterns

## Prerequisites

- JavaScript fundamentals (functions, objects, arrays)
- Understanding of closures and scope
- Basic knowledge of the DOM (helpful but not required)

## Time Commitment

- **Estimated Time:** 1-2 weeks
- **Study Time:** 8-12 hours total
- **Hands-on Practice:** 60% of time

## Unit Structure

### Lesson 1: Introduction to Reactive Programming
**Duration:** 2-3 hours
- What is reactivity?
- Push vs Pull models
- Fine-grained vs coarse-grained reactivity
- Mental models for understanding reactive systems
- Real-world analogies

**Files:**
- `lessons/lesson-01-introduction-to-reactivity.md`

### Lesson 2: The Signal Pattern
**Duration:** 2-3 hours
- Understanding Signals as reactive primitives
- The Observer pattern in reactive systems
- Dependency tracking fundamentals
- Signal lifecycle and ownership
- Memory considerations

**Files:**
- `lessons/lesson-02-signal-pattern.md`

### Lesson 3: Building Your First Signal
**Duration:** 3-4 hours
- Implementing a basic signal from scratch
- Understanding getters and setters
- Memory management basics
- Testing reactivity
- Common pitfalls

**Files:**
- `lessons/lesson-03-building-first-signal.md`
- `exercises/01-basic-signal.md`
- `exercises/02-signal-with-effects.md`

## Exercises

### Exercise 1: Basic Signal Implementation
Build a simple signal system that can:
- Store and retrieve values
- Track dependencies
- Notify observers on changes

**Difficulty:** Beginner
**Time:** 1-2 hours

### Exercise 2: Reactive Counter
Create a reactive counter that:
- Updates UI automatically
- Handles multiple subscribers
- Cleans up properly

**Difficulty:** Beginner
**Time:** 1 hour

### Exercise 3: Dependency Graph Visualizer
Build a tool to visualize:
- Signal dependencies
- Observer relationships
- Update propagation

**Difficulty:** Intermediate
**Time:** 2-3 hours

### Exercise 4: Compare Approaches
Implement the same feature:
- Imperatively (traditional)
- Reactively (signals)
- Analyze differences

**Difficulty:** Beginner
**Time:** 1 hour

## Projects

### Mini-Project: Reactive Todo List
Build a todo list application using only the concepts from this unit:
- Add/remove todos
- Mark as complete
- Filter by status
- Auto-save to localStorage

**Requirements:**
- Use only basic signals and effects
- No framework dependencies
- Proper cleanup
- Test coverage

**Time:** 3-4 hours

## Key Concepts

### 1. Reactivity
The automatic propagation of changes through a system. When a value changes, all dependent computations update automatically.

### 2. Signal
A reactive primitive that stores a value and notifies observers when the value changes.

### 3. Observer Pattern
A design pattern where observers subscribe to a subject and are notified of changes.

### 4. Dependency Tracking
The automatic recording of which computations depend on which signals.

### 5. Fine-grained Reactivity
A reactive model where individual values can be tracked and updated independently, minimizing unnecessary work.

## Success Criteria

You've mastered this unit when you can:

- [ ] Explain reactivity to a non-technical person using analogies
- [ ] Describe the Observer pattern and draw a dependency graph
- [ ] Implement a working signal system from memory
- [ ] Identify when reactive patterns are beneficial
- [ ] Debug basic reactivity issues
- [ ] Convert imperative code to reactive code

## Common Pitfalls

### 1. Forgetting to Track Dependencies
```javascript
// ❌ Wrong: Effect won't re-run when signal changes
const signal = createSignal(0);
createEffect(() => {
  console.log(signal.value); // Direct property access
});

// ✅ Correct: Call the signal as a function
createEffect(() => {
  console.log(signal()); // Proper tracking
});
```

### 2. Memory Leaks from Missing Cleanup
```javascript
// ❌ Wrong: Subscription never cleaned up
createEffect(() => {
  const interval = setInterval(() => {
    console.log(count());
  }, 1000);
  // Missing cleanup!
});

// ✅ Correct: Clean up subscriptions
createEffect(() => {
  const interval = setInterval(() => {
    console.log(count());
  }, 1000);
  onCleanup(() => clearInterval(interval));
});
```

### 3. Infinite Update Loops
```javascript
// ❌ Wrong: Effect updates its own dependency
const [count, setCount] = createSignal(0);
createEffect(() => {
  setCount(count() + 1); // Infinite loop!
});

// ✅ Correct: Break the cycle or use untrack
createEffect(() => {
  if (count() < 10) {
    setCount(count() + 1);
  }
});
```

## Resources

### Essential Reading
- Lesson 1: Introduction to Reactive Programming
- Lesson 2: The Signal Pattern
- Lesson 3: Building Your First Signal

### Supplementary Materials
- `notes/reactivity-glossary.md` - Key terms and definitions
- `notes/observer-pattern.md` - Deep dive into the pattern
- `notes/mental-models.md` - How to think about reactivity

### External Resources
- [Solid.js Documentation - Reactivity](https://docs.solidjs.com/concepts/intro-to-reactivity)
- [Wikipedia: Observer Pattern](https://en.wikipedia.org/wiki/Observer_pattern)
- [Original S.js Library](https://github.com/adamhaile/S) - Inspiration for Solid

### Video Content
- "Understanding Reactive Programming" (recommended watching)
- "The Signal Pattern Explained"
- "Building Reactive Systems"

## Quiz

Test your understanding with the Unit 1 quiz:
- 10 multiple choice questions
- 5 short answer questions
- 2 code reading exercises

**Location:** `exercises/unit-01-quiz.md`

## Next Steps

After completing this unit:

1. **Self-Assessment:** Complete the quiz and exercises
2. **Project:** Build the Reactive Todo List
3. **Review:** Revisit any challenging concepts
4. **Preview:** Skim Unit 2 materials
5. **Proceed:** Move to Unit 2 when ready

**Ready to begin?** Start with:
👉 `lessons/lesson-01-introduction-to-reactivity.md`

## Need Help?

- Review the glossary for term definitions
- Revisit examples in lesson notes
- Try simpler exercises first
- Join study group discussions
- Post questions in the forum

---

**Remember:** Take your time with these foundational concepts. Everything in later units builds on what you learn here. Master the basics before moving forward!
