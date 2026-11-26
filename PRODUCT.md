# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated by the implementation brief. Static HTML, CSS, and JavaScript modules, with Firebase AI Logic loaded from the pinned Google CDN build when a real Firebase config is present.

## Users

Students who paste lecture notes and need a first-pass flashcard deck. Hackathon judges are a second audience because the hybrid routing decision must be inspectable.

## Product Purpose

StudySplit turns lecture notes into atomic question and answer flashcards, tags difficulty, collapses duplicates, exports decks, and shows which inference leg handled each call.

## Positioning

The differentiating mechanism is visible hybrid inference. The product treats routing as part of the user interface rather than hiding it behind a model call.

## Constraints and evidence

Facts confirmed by the brief. No Firebase key is shipped. The live static demo must still produce cards. Chrome on-device availability varies by device and browser version. On-device inference is single-turn text generation through the Chrome Prompt API when used through Firebase AI Logic. App Check is required for a real Firebase AI Logic deployment. Debug tokens may be used in development but must never be committed.

## Interview note

This file was written inside an implementation subagent with no practical interview round. Facts above come from the explicit brief or Firebase documentation; no extra product claims are inferred.
