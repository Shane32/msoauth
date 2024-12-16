import React from "react";
import { render, screen } from "@testing-library/react";
import { act } from "react";
import pretty from "pretty";

// https://reactjs.org/docs/testing-recipes.html

import Card from "./Card";

//let container: HTMLDivElement = null!;
beforeEach(() => {
  // setup a DOM element as a render target
  //container = document.createElement("div");
  //document.body.appendChild(container);
});

afterEach(() => {
  // cleanup on exiting
  //unmountComponentAtNode(container);
  //container.remove();
  //container = null!;
});

it("should render the 2 of clubs", () => {
  const { container } = render(<Card card="2c" />);
  const img = container.querySelector("img");
  expect(img?.src).toContain("2C.svg");
});

it("should render the card back", () => {
  const { container } = render(<Card back />);
  const img = container.querySelector("img");
  expect(img?.src).toContain("back.svg");
});

it("should render height", () => {
  const { container } = render(<Card back height={20} />);
  const img = container.querySelector("img");
  expect(img?.style.height).toBe("20px");
});

it("should render height over specified style", () => {
  const { container } = render(<Card back height={20} style={{ height: 10, width: 50 }} />);
  const img = container.querySelector("img");
  expect(img?.style.height).toBe("20px");
  expect(img?.style.width).toBe("50px");
});

it("should render style", () => {
  const { container } = render(<Card back style={{ height: 10, width: 50 }} />);
  const img = container.querySelector("img");
  expect(img?.style.height).toBe("10px");
  expect(img?.style.width).toBe("50px");
});

it("should render default class", () => {
  let { container } = render(<Card card="2c" />);
  let img = container.querySelector("img");
  expect(img?.className).toBe(" playingcard playingcard_front");

  container = render(<Card back />).container;
  img = container.querySelector("img");
  expect(img?.className).toBe(" playingcard playingcard_back");
});

it("should render specified class", () => {
  let container;
  container = render(<Card card="2c" className="hello" />).container;
  let img = container.querySelector("img");
  expect(img?.className).toBe("hello playingcard playingcard_front");

  container = render(<Card back className="hello" />).container;
  img = container.querySelector("img");
  expect(img?.className).toBe("hello playingcard playingcard_back");
});

it("should match snapshots", () => {
  let { container } = render(<Card card="2c" />);

  expect(pretty(container.innerHTML)).toMatchInlineSnapshot(
    `"<img src="2C.svg" class=" playingcard playingcard_front" alt="2c">"`
  ); /* ... gets filled automatically by jest ... */

  container = render(<Card back />).container;

  expect(pretty(container.innerHTML)).toMatchInlineSnapshot(
    `"<img src="back.svg" class=" playingcard playingcard_back" alt="back">"`
  ); /* ... gets filled automatically by jest ... */

  container = render(<Card back height={20} />).container;

  expect(pretty(container.innerHTML)).toMatchInlineSnapshot(
    `"<img src="back.svg" class=" playingcard playingcard_back" style="height: 20px;" alt="back">"`
  ); /* ... gets filled automatically by jest ... */
});
