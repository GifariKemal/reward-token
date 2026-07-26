// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RewardToken} from "../src/RewardToken.sol";
import {BountyEscrow, IBountyFactory} from "../src/BountyEscrow.sol";

/// @dev Factory tiruan: escrow cuma butuh oracle() dari factory.
contract MockFactory is IBountyFactory {
    address public oracle;

    function setOracle(address o) external {
        oracle = o;
    }
}

contract BountyEscrowTest is Test {
    RewardToken token;
    MockFactory factory;
    BountyEscrow escrow;

    address funder = makeAddr("funder");
    address worker = makeAddr("worker");
    address oracle = makeAddr("oracle");
    address rando = makeAddr("rando");

    uint256 constant REWARD = 100 ether;
    string constant META = "ipfs://meta";
    string constant KARYA = "ipfs://karya";
    uint256 deadline;

    function setUp() public {
        token = new RewardToken(1000 ether, funder);
        factory = new MockFactory();
        factory.setOracle(oracle);
        deadline = block.timestamp + 7 days;
        escrow = new BountyEscrow(
            IBountyFactory(address(factory)), funder, IERC20(address(token)), REWARD, META, deadline
        );
    }

    function _danai() internal {
        vm.startPrank(funder);
        token.approve(address(escrow), REWARD);
        escrow.fund();
        vm.stopPrank();
    }

    function _submit() internal {
        _danai();
        vm.prank(worker);
        escrow.submitWork(KARYA);
    }

    // ---------- constructor ----------
    function test_ConstructorSetsState() public view {
        assertEq(address(escrow.factory()), address(factory));
        assertEq(address(escrow.rewardToken()), address(token));
        assertEq(escrow.funder(), funder);
        assertEq(escrow.reward(), REWARD);
        assertEq(escrow.deadline(), deadline);
        assertEq(escrow.metadataURI(), META);
        assertEq(uint256(escrow.status()), uint256(BountyEscrow.Status.Dibuka));
    }

    function test_ConstructorRevertFactoryNol() public {
        vm.expectRevert(BountyEscrow.FactoryNol.selector);
        new BountyEscrow(IBountyFactory(address(0)), funder, IERC20(address(token)), REWARD, META, deadline);
    }

    function test_ConstructorRevertFunderNol() public {
        vm.expectRevert(BountyEscrow.FunderNol.selector);
        new BountyEscrow(IBountyFactory(address(factory)), address(0), IERC20(address(token)), REWARD, META, deadline);
    }

    function test_ConstructorRevertTokenNol() public {
        vm.expectRevert(BountyEscrow.TokenNol.selector);
        new BountyEscrow(IBountyFactory(address(factory)), funder, IERC20(address(0)), REWARD, META, deadline);
    }

    function test_ConstructorRevertRewardNol() public {
        vm.expectRevert(BountyEscrow.RewardNol.selector);
        new BountyEscrow(IBountyFactory(address(factory)), funder, IERC20(address(token)), 0, META, deadline);
    }

    function test_ConstructorRevertDeadlineTakValid() public {
        vm.expectRevert(BountyEscrow.DeadlineTakValid.selector);
        new BountyEscrow(
            IBountyFactory(address(factory)), funder, IERC20(address(token)), REWARD, META, block.timestamp
        );
    }

    // ---------- fund ----------
    function test_FundLocksReward() public {
        _danai();
        assertEq(uint256(escrow.status()), uint256(BountyEscrow.Status.Didanai));
        assertEq(token.balanceOf(address(escrow)), REWARD);
        assertEq(token.balanceOf(funder), 1000 ether - REWARD);
    }

    function test_FundRevertBukanFunder() public {
        vm.prank(rando);
        vm.expectRevert(abi.encodeWithSelector(BountyEscrow.BukanFunder.selector, rando));
        escrow.fund();
    }

    function test_FundRevertStatusSalah() public {
        _danai();
        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(BountyEscrow.StatusSalah.selector, BountyEscrow.Status.Didanai));
        escrow.fund();
    }

    // ---------- submitWork ----------
    function test_SubmitWorkSetsState() public {
        _submit();
        assertEq(escrow.worker(), worker);
        assertEq(escrow.karyaURI(), KARYA);
        assertEq(uint256(escrow.status()), uint256(BountyEscrow.Status.Disubmit));
    }

    function test_SubmitWorkRevertStatusSalah() public {
        vm.prank(worker);
        vm.expectRevert(abi.encodeWithSelector(BountyEscrow.StatusSalah.selector, BountyEscrow.Status.Dibuka));
        escrow.submitWork(KARYA);
    }

    function test_SubmitWorkRevertDeadlineLewat() public {
        _danai();
        vm.warp(deadline + 1);
        vm.prank(worker);
        vm.expectRevert(BountyEscrow.DeadlineLewat.selector);
        escrow.submitWork(KARYA);
    }

    function test_SubmitWorkRevertFunderTakBolehSubmit() public {
        _danai();
        vm.prank(funder);
        vm.expectRevert(BountyEscrow.FunderTakBolehSubmit.selector);
        escrow.submitWork(KARYA);
    }

    function test_SubmitWorkRevertKaryaKosong() public {
        _danai();
        vm.prank(worker);
        vm.expectRevert(BountyEscrow.KaryaKosong.selector);
        escrow.submitWork("");
    }

    // ---------- fulfillVerification ----------
    function test_FulfillApprovePaysWorker() public {
        _submit();
        vm.prank(oracle);
        escrow.fulfillVerification(true);
        assertEq(uint256(escrow.status()), uint256(BountyEscrow.Status.Disetujui));
        assertEq(token.balanceOf(worker), REWARD);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function test_FulfillRejectResetsToDidanai() public {
        _submit();
        vm.prank(oracle);
        escrow.fulfillVerification(false);
        assertEq(uint256(escrow.status()), uint256(BountyEscrow.Status.Didanai));
        assertEq(escrow.worker(), address(0));
        assertEq(escrow.karyaURI(), "");
        assertEq(token.balanceOf(address(escrow)), REWARD);
    }

    function test_FulfillRevertBukanOracle() public {
        _submit();
        vm.prank(rando);
        vm.expectRevert(abi.encodeWithSelector(BountyEscrow.BukanOracle.selector, rando));
        escrow.fulfillVerification(true);
    }

    function test_FulfillRevertStatusSalah() public {
        _danai();
        vm.prank(oracle);
        vm.expectRevert(abi.encodeWithSelector(BountyEscrow.StatusSalah.selector, BountyEscrow.Status.Didanai));
        escrow.fulfillVerification(true);
    }

    function test_ResubmitAfterRejectThenApprove() public {
        _submit();
        vm.prank(oracle);
        escrow.fulfillVerification(false);
        vm.prank(worker);
        escrow.submitWork(KARYA);
        assertEq(uint256(escrow.status()), uint256(BountyEscrow.Status.Disubmit));
        vm.prank(oracle);
        escrow.fulfillVerification(true);
        assertEq(token.balanceOf(worker), REWARD);
    }

    // ---------- cancel ----------
    function test_CancelBeforeFundNoRefund() public {
        vm.prank(funder);
        escrow.cancel();
        assertEq(uint256(escrow.status()), uint256(BountyEscrow.Status.Dibatalkan));
        assertEq(token.balanceOf(funder), 1000 ether);
    }

    function test_CancelAfterFundRefunds() public {
        _danai();
        vm.prank(funder);
        escrow.cancel();
        assertEq(uint256(escrow.status()), uint256(BountyEscrow.Status.Dibatalkan));
        assertEq(token.balanceOf(funder), 1000 ether);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function test_CancelAfterSubmitRefunds() public {
        _submit();
        vm.prank(funder);
        escrow.cancel();
        assertEq(uint256(escrow.status()), uint256(BountyEscrow.Status.Dibatalkan));
        assertEq(token.balanceOf(funder), 1000 ether);
    }

    function test_CancelRevertBukanFunder() public {
        vm.prank(rando);
        vm.expectRevert(abi.encodeWithSelector(BountyEscrow.BukanFunder.selector, rando));
        escrow.cancel();
    }

    function test_CancelRevertStatusSalahAfterApproved() public {
        _submit();
        vm.prank(oracle);
        escrow.fulfillVerification(true);
        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(BountyEscrow.StatusSalah.selector, BountyEscrow.Status.Disetujui));
        escrow.cancel();
    }
}
